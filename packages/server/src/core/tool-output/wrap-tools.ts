import { randomUUID } from 'node:crypto';
import type { Tool } from 'ai';
import {
  getToolOutputCompressionMode,
  getToolOutputMinChars,
  getToolOutputMinSavingsRatio,
  getToolOutputQueryMaxChars,
  getToolOutputContextMaxLines,
  getToolOutputRetrievalDefaultLimit,
  getToolOutputRetrievalMaxLimit,
  getToolOutputRetrievalMaxChars,
  getToolOutputTargetChars,
} from '@/env';
import { processToolOutput, resolvePartIdForCallId } from './process';
import type { CompressionRuntimeConfig } from './types';

const RETRIEVAL_TOOL_NAME = 'retrieve_tool_output';

export interface WrapToolsOptions {
  sessionId: string;
}

type AnyTool = Tool<unknown, unknown> | { execute?: ((...args: unknown[]) => unknown) | undefined };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getDefaultCompressionConfig(): CompressionRuntimeConfig {
  return {
    compression: {
      minChars: getToolOutputMinChars(),
      targetChars: getToolOutputTargetChars(),
      minSavingsRatio: getToolOutputMinSavingsRatio(),
    },
    retrieval: {
      defaultLimit: getToolOutputRetrievalDefaultLimit(),
      maxLimit: getToolOutputRetrievalMaxLimit(),
      maxChars: getToolOutputRetrievalMaxChars(),
      queryMaxChars: getToolOutputQueryMaxChars(),
      contextMaxLines: getToolOutputContextMaxLines(),
    },
  };
}

function makeRetrievalId(): string {
  const uuid = randomUUID().replace(/-/g, '');
  return `j2out_${uuid.slice(0, 24)}`;
}

export function wrapToolsWithOutputProcessing(
  tools: Record<string, AnyTool>,
  options: WrapToolsOptions,
): Record<string, AnyTool> {
  const config = getDefaultCompressionConfig();
  const mode = getToolOutputCompressionMode();
  const wrapped: Record<string, AnyTool> = {};

  for (const [name, original] of Object.entries(tools)) {
    if (name === RETRIEVAL_TOOL_NAME) {
      wrapped[name] = original;
      continue;
    }
    if (!original || typeof original !== 'object') {
      wrapped[name] = original;
      continue;
    }
    const exec = (original as { execute?: unknown }).execute;
    if (typeof exec !== 'function') {
      wrapped[name] = original;
      continue;
    }

    const executeFn = exec as (input: unknown, opts: unknown) => unknown;
    const wrappedTool: AnyTool = {
      ...(original as Record<string, unknown>),
      execute: async (input: unknown, execOptions: unknown) => {
        const toolCallId = isPlainObject(execOptions) && typeof execOptions.toolCallId === 'string'
          ? execOptions.toolCallId
          : '';

        const originalResult = await executeFn(input, execOptions);

        if (!toolCallId) {
          return originalResult;
        }
        if (isPlainObject(originalResult) && typeof originalResult.error === 'string') {
          return originalResult;
        }

        try {
          const processed = processToolOutput(originalResult, {
            sessionId: options.sessionId,
            toolCallId,
            toolName: name,
            mode,
            config,
            resolvePartId: () => resolvePartIdForCallId(options.sessionId, toolCallId),
            idGenerator: makeRetrievalId,
            now: () => Date.now(),
          });
          return processed.output;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `Tool output processing failed for session=${options.sessionId} tool=${name} callId=${toolCallId}: ${message}`,
          );
          return originalResult;
        }
      },
    };
    wrapped[name] = wrappedTool;
  }

  return wrapped;
}