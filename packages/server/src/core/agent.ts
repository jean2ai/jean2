import { streamText, stepCountIs, Output, jsonSchema } from 'ai';
import type { MessageWithParts, ToolPart, StepPart, Preconfig, MessageEvent, AssistantMessage, ResponseFormat } from '@jean2/sdk';
import { createMessage, updateMessage, getSession, updateSession, transitionToolToInterrupted } from '@/store';

import { findModel, findModelVariant, getMaxOutputTokens } from '@/config';
import { buildWorkspaceSystemPrompt } from './prompts/workspace-context';
import { loadInstructions, formatInstructions } from './instructions';
import { randomUUID } from 'crypto';
import { interruptManager } from './interrupt';
import { rejectPendingAsksBySession } from '@/tools/ask-user-api';
import { broadcastSessionUpdated } from './broadcast';
import { getModelWithMetadata } from './model-utils';

import { createStepCallbacks, type CallbackEvent } from './step-handlers';
import { createStreamHandlers } from './stream-handlers';
import { convertToAiSdkMessages } from './message-utils';
import { buildSchemaPromptInstruction, extractJsonFromText } from './structured-output';
import { buildAiSdkTools, type BuildToolsOptions } from './build-tools';
import { loadMemoryInstructions, MEMORY_GUIDANCE } from '@/memory';
import { SKILL_MANAGE_GUIDANCE } from '@/skills';
import { SESSION_SEARCH_GUIDANCE } from '@/session-search';
import { getWorkspace } from '@/store';
import { getAgentDirectory } from '@/agents/storage';
import { readAgentMemoryFile } from '@/agents/memory';
import { join } from 'path';
import {
  getLLMTemperature,
  getLLMMaxSteps,
  getCompactionAutoThresholdRatio,
  getCompactionAutoReserveCapTokens,
  getCompactionAutoSafetyMarginTokens,
} from '@/env';

import { classifyApiError } from '@/utils/errors';
import { createErrorEvent, type ErrorEvent } from './error-handling';
import type { CompactionPolicy } from './compaction';

export interface ChatOptions {
  sessionId: string;
  preconfig: Preconfig;
  messages: MessageWithParts[];
  modelId?: string;
  providerId?: string;
  variant?: string;
  workspacePath?: string;
  workspaceId?: string;
  additionalPaths?: string[];
  maxSteps?: number;
  compactionPolicy?: CompactionPolicy;
  broadcastFn?: BuildToolsOptions['broadcastFn'];
  responseFormat?: ResponseFormat;
}

function collectInterruptedToolPartEvents(
  toolParts: ToolPart[],
  sessionId: string,
): MessageEvent[] {
  const events: MessageEvent[] = [];
  for (const toolPart of toolParts) {
    if (toolPart.state.status === 'pending' || toolPart.state.status === 'running') {
      const updatedPart = transitionToolToInterrupted(toolPart.id, 'user_request');
      if (updatedPart) {
        events.push({ type: 'part.updated', sessionId, part: updatedPart });
      }
    }
  }
  return events;
}

function buildInterruptedMessage(assistantMessage: AssistantMessage): AssistantMessage {
  return {
    ...assistantMessage,
    status: 'interrupted' as const,
    error: 'Interrupted by user',
  };
}

export interface ChatResult {
  message: AssistantMessage;
  toolCalls: ToolPart[];
}

export async function* streamChat(options: ChatOptions): AsyncGenerator<MessageEvent | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string; variant: string | null } | { type: 'needs_compaction'; sessionId: string } | ErrorEvent> {
  const { sessionId: _sessionId, preconfig, messages, modelId, providerId, variant, workspacePath, workspaceId, maxSteps, compactionPolicy } = options;

  // Register session with interrupt manager
  const abortController = interruptManager.registerSession(_sessionId);

  // Initialize MCP for workspace
  if (workspacePath) {
    const { initializeWorkspace: initMcp } = await import('@/mcp');
    initMcp(workspacePath).catch((err) => {
      console.error('Failed to initialize MCP:', err);
    });
  }

  // Check if this is a main session (not a subagent) and set runningAt
  const session = getSession(_sessionId);
  const isMainSession = session && !session.parentId;
  if (isMainSession) {
    updateSession(_sessionId, { runningAt: new Date().toISOString() });
    // Broadcast the session update so clients know the session is running
    const updatedSession = getSession(_sessionId);
    if (updatedSession) {
      broadcastSessionUpdated(updatedSession);
    }
  }

  // Resolve model: session override > preconfig > env default
  const resolvedModelId = modelId || (preconfig.model ?? undefined);

  const toolNames = preconfig.tools || [];
  const resolvedProviderId = providerId;

  // Inject agent home directory as additional path if this is an agent
  const agentDir = await getAgentDirectory(preconfig.id);
  const effectiveAdditionalPaths = agentDir
    ? [...(options.additionalPaths || []), join(agentDir, 'home')]
    : options.additionalPaths;

  const aiTools = await buildAiSdkTools({
    toolNames,
    workspacePath,
    workspaceId,
    sessionId: _sessionId,
    modelId: resolvedModelId,
    providerId: resolvedProviderId,
    canSpawnSubagents: preconfig.canSpawnSubagents,
    allowedSkills: preconfig.skills,
    broadcastFn: options.broadcastFn,
    additionalPaths: effectiveAdditionalPaths,
    agentId: preconfig.id,
  });

  // Build system message with workspace context
  let systemMessage = preconfig.systemPrompt || '';

  // Inject agent memory layers if this is an agent
  if (agentDir) {
    const agentUserMemory = await readAgentMemoryFile(preconfig.id, 'USER.md');
    if (agentUserMemory) {
      systemMessage = `<agent_user_preferences>\n${agentUserMemory}\n</agent_user_preferences>\n\n` + systemMessage;
    }
    const agentMemory = await readAgentMemoryFile(preconfig.id, 'MEMORY.md');
    if (agentMemory) {
      systemMessage = `<agent_memory>\n${agentMemory}\n</agent_memory>\n\n` + systemMessage;
    }

    systemMessage = systemMessage + '\n\n' + `You have personal memory and skills that travel with you across all workspaces.

MEMORY:
- Use "memory" (workspace) for facts about THIS project (repo conventions, build commands, project-specific patterns).
- Use "agent_memory" (personal) for cross-project knowledge: reusable patterns, techniques, pitfalls, and user preferences that apply everywhere.
- Save to agent_memory when: you complete a complex multi-step task, the user corrects your approach, you discover a pattern useful beyond this project, or you debug through errors.

SKILLS:
- Use "skill_manage" for procedures specific to THIS workspace.
- Use "agent_skill_manage" for personal workflows you've refined across projects.

Before saving, use list to check existing entries and avoid duplicates.`;
  }

  // Add instructions (global first, then project)
  const instructions = await loadInstructions(workspacePath);
  const instructionsSection = formatInstructions(instructions);
  if (instructionsSection) {
    systemMessage = systemMessage + '\n\n' + instructionsSection;
  }

  // Add workspace context
  if (workspacePath) {
    const workspaceContext = buildWorkspaceSystemPrompt(workspacePath, effectiveAdditionalPaths);
    systemMessage = systemMessage + '\n\n' + workspaceContext;
  }

  // Add workspace memory if enabled
  if (workspaceId) {
    const workspace = getWorkspace(workspaceId);
    if (workspace?.settings?.memory?.enabled && workspacePath) {
      const memorySection = await loadMemoryInstructions(workspacePath);
      if (memorySection) {
        systemMessage = systemMessage + '\n\n' + memorySection;
      }
      systemMessage = systemMessage + '\n\n' + MEMORY_GUIDANCE;
    }

    // Add skill management guidance if enabled
    if (workspace?.settings?.skills?.managementEnabled) {
      systemMessage = systemMessage + '\n\n' + SKILL_MANAGE_GUIDANCE;
    }

    // Add session search guidance if enabled
    if (workspace?.settings?.sessionSearch?.enabled) {
      systemMessage = systemMessage + '\n\n' + SESSION_SEARCH_GUIDANCE;
    }
  }

  const { model, useProviderInstructions, omitMaxOutputTokens, providerOptions: baseProviderOptions } =
    await getModelWithMetadata({
      modelId: resolvedModelId,
      providerId,
      systemPrompt: systemMessage,
      sessionId: _sessionId,
    });

  // Resolve model definition for context window and capabilities
  const modelDef = resolvedModelId ? findModel(resolvedModelId) : undefined;
  const contextWindow = modelDef?.contextWindow;

  // Convert messages for ai-sdk, passing model capabilities for multimodal handling
  const aiMessages = await convertToAiSdkMessages(messages, modelDef?.capabilities);
  const modelMaxOutputTokens = contextWindow ? getMaxOutputTokens(resolvedModelId) : 0;

  // Resolve hybrid formula parameters from compactionPolicy or env defaults
  const autoThresholdRatio = compactionPolicy?.autoThresholdRatio ?? getCompactionAutoThresholdRatio();
  const autoReserveCapTokens = compactionPolicy?.autoReserveCapTokens ?? getCompactionAutoReserveCapTokens();
  const autoSafetyMarginTokens = compactionPolicy?.autoSafetyMarginTokens ?? getCompactionAutoSafetyMarginTokens();

  // Compute auto-compaction threshold using hybrid formula:
  // reserve = min(modelMaxOutputTokens, reserveCapTokens)
  // threshold = min(floor(contextWindow * ratio), contextWindow - reserve - safetyMarginTokens)
  let autoThreshold: number;
  if (contextWindow) {
    const reserve = Math.min(modelMaxOutputTokens, autoReserveCapTokens);
    const ratioBasedThreshold = Math.floor(contextWindow * autoThresholdRatio);
    const safeThreshold = contextWindow - reserve - autoSafetyMarginTokens;
    // Defensive: ensure non-negative threshold for edge cases (e.g., tiny context windows)
    autoThreshold = Math.max(0, Math.min(ratioBasedThreshold, safeThreshold));
  } else {
    autoThreshold = 0;
  }

  const messageId = randomUUID();
  const stepCtx = {
    messageId,
    sessionId: _sessionId,
    stepParts: [] as StepPart[],
    yieldFn: null as ((event: CallbackEvent) => void) | null,
    isMainSession,
    contextWindow,
    autoThreshold,
    resolvedModelId,
    variant,
    needsCompaction: false,
    latestUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  const { experimental_onStepStart, onStepFinish } = createStepCallbacks(stepCtx);

  // Resolve variant providerOptions if applicable
  const variantOpts = variant ? findModelVariant(resolvedModelId || '', variant) : undefined;

  // Determine the provider-specific providerOptions key based on the provider
  const resolvedProvider = providerId || 'openai';
  const providerOptionsKey = resolvedProvider === 'codex' ? 'openai' : resolvedProvider;

  // Build providerOptions from model factory result and variant
  let providerOptions: Record<string, Record<string, unknown>> | undefined;
  if (baseProviderOptions) {
    providerOptions = {
      ...baseProviderOptions,
      ...(variantOpts ? { [providerOptionsKey]: { ...(baseProviderOptions[providerOptionsKey] || {}), ...variantOpts } } : {}),
    };
  } else if (variantOpts) {
    providerOptions = { [providerOptionsKey]: variantOpts };
  }

  // Structured output handling: providers that strip the schema (GLM, MiniMax)
  // need it injected into the system prompt instead of using Output.object().
  const structuredOutputMode = modelDef?.capabilities?.structuredOutput?.mode ?? 'native';
  const usePromptBasedStructuredOutput =
    options.responseFormat && structuredOutputMode === 'prompt';

  // For prompt-based mode, inject the schema instruction into the system message
  if (usePromptBasedStructuredOutput && options.responseFormat && systemMessage) {
    systemMessage = systemMessage + '\n\n' + buildSchemaPromptInstruction(options.responseFormat);
  }

  // For native mode (or no response format), use Output.object() as normal
  const streamOutput = options.responseFormat && !usePromptBasedStructuredOutput
    ? Output.object({ schema: jsonSchema(options.responseFormat.schema) })
    : undefined;

  const result = streamText({
    model,
    system: useProviderInstructions ? undefined : systemMessage,
    messages: aiMessages,
    tools: aiTools,
    maxOutputTokens: omitMaxOutputTokens ? undefined : getMaxOutputTokens(resolvedModelId),
    providerOptions: providerOptions as Parameters<typeof streamText>[0]['providerOptions'],
    temperature: (preconfig.settings?.temperature ?? getLLMTemperature()) as number,
    stopWhen: stepCountIs(maxSteps ?? getLLMMaxSteps()),
    abortSignal: abortController.signal,
    experimental_onStepStart,
    onStepFinish,
    ...(streamOutput ? { output: streamOutput } : {}),
  });

  

  // Create assistant message
  const assistantMessage: AssistantMessage = {
    id: messageId,
    sessionId: _sessionId,
    role: 'assistant',
    status: 'streaming',
    createdAt: Date.now(),
    modelId: resolvedModelId || 'gpt-4o',
    providerId: providerId || 'openai',
    tokens: { prompt: 0, completion: 0 },
    cost: 0,
  };

  // Store the assistant message in DB - pass the full message object
  createMessage(assistantMessage);

  // Emit message.created event
  yield { type: 'message.created', message: assistantMessage };

  // Set up the yield function for callbacks and stream handlers
  // Use a single queue to handle events from callbacks since we can't yield from inside a callback
  const eventQueue: Array<CallbackEvent> = [];

  stepCtx.yieldFn = (event) => {
    eventQueue.push(event);
  };

  const streamCtx = {
    messageId,
    sessionId: _sessionId,
    toolParts: [] as ToolPart[],
    currentText: '',
    currentTextPartId: null as string | null,
    currentReasoning: '',
    currentReasoningPartId: null as string | null,
    yieldFn: (event: MessageEvent) => { eventQueue.push(event); },
  };

  const handlers = createStreamHandlers(streamCtx);

  try {
    for await (const delta of result.fullStream) {

      if (abortController.signal.aborted) {
        handlers.flushPending();
        // Clean up any pending/running tool parts that won't get results
        for (const event of collectInterruptedToolPartEvents(streamCtx.toolParts, _sessionId)) {
          yield event;
        }
        const interruptedMessage = buildInterruptedMessage(assistantMessage);
        yield { type: 'message.updated', message: interruptedMessage };
        updateMessage(messageId, interruptedMessage);
        return;
      }

      switch (delta.type) {
      case 'text-delta':
        handlers.handleTextDelta(delta);
        break;
      case 'reasoning-delta':
        handlers.handleReasoningDelta(delta);
        break;
      case 'tool-call':
        handlers.handleToolCall(delta);
        break;
      case 'tool-result':
        handlers.handleToolResult(delta);
        break;
      case 'error': {
        const error = (delta as { type: 'error'; error: unknown }).error;
        throw error;
      }
      }

      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        yield event;
      }
    }
    handlers.flushPending();
  } catch (err) {
    handlers.flushPending();
    const classified = classifyApiError(err);

    console.error('[streamChat] AI SDK error', {
      sessionId: _sessionId,
      model: resolvedModelId,
      provider: providerId,
      errorType: classified.type,
      errorMessage: classified.message,
      retryable: classified.retryable,
      rawError: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    });

    // Check if it's an abort/interrupt (already handled)
    if (abortController.signal.aborted) {
      // Clean up any pending/running tool parts that won't get results
      for (const event of collectInterruptedToolPartEvents(streamCtx.toolParts, _sessionId)) {
        yield event;
      }
      const interruptedMessage = buildInterruptedMessage(assistantMessage);
      yield { type: 'message.updated', message: interruptedMessage };
      updateMessage(messageId, interruptedMessage);
      return;
    }

    // Handle non-retryable errors - update message status then yield error event
    if (!classified.retryable) {
      // Update message status to error FIRST so client receives it before the error event
      const errorMessage: AssistantMessage = {
        ...assistantMessage,
        status: 'error',
        error: classified.message,
      };
      yield { type: 'message.updated', message: errorMessage };
      updateMessage(messageId, errorMessage);

      yield createErrorEvent(classified);
      return;
    }

    // For retryable errors, throw to let caller handle retry
    throw classified;
  } finally {
    // Cleanup interrupt registration - always runs on success, error, or abort
    interruptManager.unregisterSession(_sessionId);

    // Reject any lingering permission asks for this session.
    // When the session ends (maxSteps reached, error, abort), tools that were
    // waiting for user permission won't get a response — clean them up so the
    // client UI (chat prompts + sidebar warning icons) is cleared immediately.
    rejectPendingAsksBySession(_sessionId);

    // Clear runningAt and broadcast session update for main sessions
    if (isMainSession) {
      updateSession(_sessionId, { runningAt: null });
      const updatedSession = getSession(_sessionId);
      if (updatedSession) {
        broadcastSessionUpdated(updatedSession);
      }
    }
  }

  // Finalize: get usage data FIRST, then update message with actual tokens
  let usageData = null;
  let structuredOutputData: import('@jean2/sdk').StructuredOutputData | undefined;
  try {
    const totalUsagePromise = result.totalUsage;
    const usagePromise = result.usage;
    const [totalUsage, usage] = await Promise.all([totalUsagePromise, usagePromise]);
    usageData = usage ?? totalUsage;

    // Extract structured output if response format was specified
    if (options.responseFormat) {
      try {
        if (usePromptBasedStructuredOutput) {
          // Prompt-based mode: parse JSON from accumulated text output
          const parsed = extractJsonFromText(streamCtx.currentText);
          if (parsed) {
            structuredOutputData = {
              formatName: options.responseFormat.name,
              data: parsed,
              schema: options.responseFormat.schema,
            };
          } else {
            console.warn('Failed to parse structured output from text response');
          }
        } else {
          // Native mode: get validated object from AI SDK
          const output = await result.output;
          if (output && typeof output === 'object') {
            structuredOutputData = {
              formatName: options.responseFormat.name,
              data: output as Record<string, unknown>,
              schema: options.responseFormat.schema,
            };
          }
        }
      } catch (_outputErr) {
        console.warn('Failed to get structured output:', _outputErr);
      }
    }
  } catch (_usageErr) {
    // Usage is optional - continue without it
    console.warn('Failed to get usage data:', _usageErr);
  }

  const finalMessage: AssistantMessage = {
    ...assistantMessage,
    status: 'completed',
    completedAt: Date.now(),
    tokens: {
      prompt: usageData?.inputTokens ?? 0,
      completion: usageData?.outputTokens ?? 0,
    },
    ...(structuredOutputData ? { structuredOutput: structuredOutputData } : {}),
  };

  // Emit message.updated event with actual tokens
  yield { type: 'message.updated', message: finalMessage };

  // Emit usage event for session tracking
  if (usageData) {
    const actualModelId = resolvedModelId || 'gpt-4o';
    yield {
      type: 'usage',
      usage: {
        promptTokens: stepCtx.latestUsage.promptTokens,
        completionTokens: stepCtx.latestUsage.completionTokens,
        totalTokens: stepCtx.latestUsage.totalTokens,
      },
      model: actualModelId,
      variant: variant || null,
    };
  }

  // Auto-compaction: yield needs_compaction event for main sessions
  if (isMainSession && stepCtx.needsCompaction) {
    yield { type: 'needs_compaction', sessionId: _sessionId };
  }
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  let finalMessage: AssistantMessage | null = null;
  const toolCalls: ToolPart[] = [];

  for await (const event of streamChat(options)) {
    if (event.type === 'part.created' && event.part.type === 'tool') {
      toolCalls.push(event.part);
    }
    if (event.type === 'message.updated' && event.message.role === 'assistant') {
      finalMessage = event.message;
    }
  }

  return {
    message: finalMessage!,
    toolCalls,
  };
}