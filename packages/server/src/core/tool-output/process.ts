import type {
  CompressedToolOutput,
  ToolOutputArtifactMetadata,
  ToolOutputStrategy,
} from '@jean2/sdk';
import { createToolOutputArtifact } from '@/store/tool-output-artifacts';
import { getToolPartByCallId } from '@/store/messages';
import { stripVisualization, extractVisualization } from '@/utils/strip-visualization';
import {
  countSerializedChars,
  hashToolOutput,
  serializeToolOutput,
} from './serialization';
import { compressPaths } from './compress-paths';
import { compressRecords } from './compress-records';
import { compressLogs } from './compress-logs';
import { buildDurablePreview } from './compress-preview';
import { detectSafeShape, getPolicyForTool } from './policy';
import type {
  CompressionFailureReason,
  ProcessToolOutputOptions,
  ProcessToolOutputResult,
} from './types';

const PREVIEW_TRIGGER_CHARS = 50_000;
const RETRIEVAL_TOOL_NAME = 'retrieve_tool_output';

interface Candidate {
  strategy: ToolOutputStrategy;
  payload: CompressedToolOutput;
}

function meetsSavingsGate(
  originalChars: number,
  modelChars: number,
  ratio: number,
): boolean {
  if (originalChars <= 0) return false;
  return modelChars <= originalChars * (1 - ratio);
}

function reattachVisualization(
  output: unknown,
  visualization: unknown | undefined,
): unknown {
  if (visualization === undefined) return output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return { ...(output as Record<string, unknown>), _visualization: visualization };
  }
  return output;
}

function unchanged(
  output: unknown,
  reason: CompressionFailureReason | null = null,
): ProcessToolOutputResult {
  return {
    output,
    artifactId: null,
    strategy: null,
    applied: false,
    reason,
    durationMs: 0,
  };
}

function persistCandidate(input: {
  options: ProcessToolOutputOptions;
  candidate: Candidate;
  serialized: string;
  originalChars: number;
  applied: boolean;
  fallbackOutput: unknown;
  processingStartedAt: number;
}): ProcessToolOutputResult {
  const partId = input.options.resolvePartId();
  if (!partId) {
    return unchanged(input.fallbackOutput, 'shape-mismatch');
  }

  const createdAt = input.options.now();
  const durationMs = Math.max(0, createdAt - input.processingStartedAt);
  const artifactId = input.candidate.payload.retrievalId;

  createToolOutputArtifact({
    id: artifactId,
    sessionId: input.options.sessionId,
    partId,
    callId: input.options.toolCallId,
    toolName: input.options.toolName,
    strategy: input.candidate.strategy,
    sourceHash: hashToolOutput(input.serialized),
    originalJson: input.serialized,
    modelOutputJson: JSON.stringify(input.candidate.payload),
    originalChars: input.originalChars,
    modelChars: input.candidate.payload.modelChars,
    createdAt,
    applied: input.applied,
    compressionDurationMs: durationMs,
  });

  return {
    output: input.candidate.payload,
    artifactId,
    strategy: input.candidate.strategy,
    applied: input.applied,
    reason: null,
    durationMs,
  };
}

function persistPreview(input: {
  options: ProcessToolOutputOptions;
  serialized: string;
  originalChars: number;
  retrievalId: string;
  fallbackOutput: unknown;
  processingStartedAt: number;
}): ProcessToolOutputResult {
  const preview = buildDurablePreview({
    serialized: input.serialized,
    config: input.options.config.compression,
    toolName: input.options.toolName,
    retrievalId: input.retrievalId,
  });
  return persistCandidate({
    options: input.options,
    candidate: { strategy: 'preview', payload: preview.payload },
    serialized: input.serialized,
    originalChars: input.originalChars,
    applied: true,
    fallbackOutput: input.fallbackOutput,
    processingStartedAt: input.processingStartedAt,
  });
}

export function processToolOutput(
  original: unknown,
  options: ProcessToolOutputOptions,
): ProcessToolOutputResult {
  if (options.toolName === RETRIEVAL_TOOL_NAME || original === null || original === undefined) {
    return unchanged(original);
  }

  const visualization = extractVisualization(original);
  const logical = visualization === undefined ? original : stripVisualization(original);

  let serialized: string;
  try {
    serialized = serializeToolOutput(logical);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return unchanged(original, message.toLowerCase().includes('circular') ? 'circular' : 'unserializable');
  }

  const originalChars = countSerializedChars(serialized);
  if (originalChars === 0) return unchanged(original);

  const processingStartedAt = options.now();
  const basePolicy = getPolicyForTool(options.toolName);
  const fallbackOutput = reattachVisualization(original, visualization);
  const buildPreview = (retrievalId: string): ProcessToolOutputResult => {
    const persisted = persistPreview({
      options,
      serialized,
      originalChars,
      retrievalId,
      fallbackOutput,
      processingStartedAt,
    });
    return {
      ...persisted,
      output: persisted.artifactId
        ? reattachVisualization(persisted.output, visualization)
        : fallbackOutput,
    };
  };

  if (basePolicy.mode === 'exact') {
    return originalChars > PREVIEW_TRIGGER_CHARS
      ? buildPreview(options.idGenerator())
      : unchanged(fallbackOutput);
  }

  if (options.mode === 'off') {
    return originalChars > PREVIEW_TRIGGER_CHARS
      ? buildPreview(options.idGenerator())
      : unchanged(fallbackOutput);
  }

  if (originalChars <= options.config.compression.minChars) {
    return unchanged(fallbackOutput, 'below-threshold');
  }

  if (options.mode === 'observe' && originalChars > PREVIEW_TRIGGER_CHARS) {
    return buildPreview(options.idGenerator());
  }

  const policy = basePolicy.mode === 'detect-safe' ? detectSafeShape(logical) : basePolicy;
  if (policy.mode === 'exact') {
    return originalChars > PREVIEW_TRIGGER_CHARS
      ? buildPreview(options.idGenerator())
      : unchanged(fallbackOutput, 'policy-miss');
  }

  const retrievalId = options.idGenerator();
  let candidate: Candidate | null = null;
  let candidateReason: CompressionFailureReason | null = null;

  if (policy.mode === 'records') {
    const result = compressRecords({
      output: logical as Record<string, unknown>,
      arrayKey: policy.arrayKey,
      config: options.config.compression,
      toolName: options.toolName,
      retrievalId,
      originalChars,
    });
    if (result) {
      candidate = { strategy: 'records', payload: result.payload };
    } else {
      candidateReason = 'shape-mismatch';
    }
  } else if (policy.mode === 'paths') {
    const array = (logical as Record<string, unknown>)[policy.arrayKey];
    if (Array.isArray(array) && array.every((path): path is string => typeof path === 'string')) {
      const result = compressPaths({
        paths: array,
        config: options.config.compression,
        toolName: options.toolName,
        retrievalId,
        arrayKey: policy.arrayKey,
        originalChars,
      });
      if (result) {
        candidate = { strategy: 'paths', payload: result.payload };
      } else {
        candidateReason = 'shape-mismatch';
      }
    } else {
      candidateReason = 'shape-mismatch';
    }
  } else if (policy.mode === 'logs') {
    const result = compressLogs({
      output: logical as Record<string, unknown>,
      textKeys: policy.textKeys,
      config: options.config.compression,
      toolName: options.toolName,
      retrievalId,
      originalChars,
    });
    if (result) {
      candidate = { strategy: 'logs', payload: result.payload };
    } else {
      candidateReason = 'shape-mismatch';
    }
  }

  if (!candidate) {
    if (options.mode === 'active' || originalChars > PREVIEW_TRIGGER_CHARS) {
      const preview = buildPreview(retrievalId);
      return { ...preview, reason: preview.artifactId ? candidateReason ?? 'no-savings' : preview.reason };
    }
    return unchanged(fallbackOutput, candidateReason ?? 'no-savings');
  }

  if (!meetsSavingsGate(
    originalChars,
    candidate.payload.modelChars,
    options.config.compression.minSavingsRatio,
  )) {
    return originalChars > PREVIEW_TRIGGER_CHARS
      ? buildPreview(retrievalId)
      : unchanged(fallbackOutput, 'no-savings');
  }

  const applied = options.mode === 'active';
  const persisted = persistCandidate({
    options,
    candidate,
    serialized,
    originalChars,
    applied,
    fallbackOutput,
    processingStartedAt,
  });

  return {
    ...persisted,
    output: persisted.artifactId && applied
      ? reattachVisualization(persisted.output, visualization)
      : fallbackOutput,
  };
}

export function resolvePartIdForCallId(
  sessionId: string,
  callId: string,
): string | null {
  const part = getToolPartByCallId(sessionId, callId);
  return part?.id ?? null;
}

export function artifactMetadataForRecord(
  record: { id: string; sessionId: string; partId: string; callId: string; toolName: string; strategy: ToolOutputStrategy; sourceHash: string; originalChars: number; modelChars: number; createdAt: number; applied: boolean; compressionDurationMs: number; modelRetrievalCount: number; userRetrievalCount: number; lastRetrievedAt: number | null },
): ToolOutputArtifactMetadata {
  return {
    id: record.id,
    sessionId: record.sessionId,
    partId: record.partId,
    callId: record.callId,
    toolName: record.toolName,
    strategy: record.strategy,
    sourceHash: record.sourceHash,
    originalChars: record.originalChars,
    modelChars: record.modelChars,
    createdAt: record.createdAt,
    applied: record.applied,
    compressionDurationMs: record.compressionDurationMs,
    modelRetrievalCount: record.modelRetrievalCount,
    userRetrievalCount: record.userRetrievalCount,
    lastRetrievedAt: record.lastRetrievedAt,
  };
}
