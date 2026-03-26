import { streamText, stepCountIs } from 'ai';
import type { MessageWithParts, TextPart, ToolPart, StepPart, ReasoningPart, Preconfig, MessageEvent, AssistantMessage } from '@jean2/shared';
import { createMessage, createPart, updatePart, updateMessage, getSession, updateSession, getPart } from '@/store';
import type { PermissionRequestCallback } from '@/tools';
import { findModel, findModelVariant, getMaxOutputTokens } from '@/config';
import { buildWorkspaceSystemPrompt } from './prompts/workspace-context';
import { loadInstructions, formatInstructions } from './instructions';
import { randomUUID } from 'crypto';
import { interruptManager } from './interrupt';
import { broadcastSessionUpdated } from './broadcast';
import { getModelWithMetadata } from './model-utils';
import { parseToolInput } from './part-utils';
import { createStepCallbacks, type CallbackEvent } from './step-handlers';
import { convertToAiSdkMessages } from './message-utils';
import { buildAiSdkTools } from './build-tools';
import {
  getLLMTemperature,
  getLLMMaxSteps,
  getCompactionAutoThresholdRatio,
  getCompactionAutoReserveCapTokens,
  getCompactionAutoSafetyMarginTokens,
} from '../env';
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
  onPermissionRequest?: PermissionRequestCallback;
  maxSteps?: number;
  compactionPolicy?: CompactionPolicy;
}

export interface ChatResult {
  message: AssistantMessage;
  toolCalls: ToolPart[];
}

export async function* streamChat(options: ChatOptions): AsyncGenerator<MessageEvent | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string; variant: string | null } | { type: 'needs_compaction'; sessionId: string } | ErrorEvent> {
  const { sessionId: _sessionId, preconfig, messages, modelId, providerId, variant, workspacePath, workspaceId, onPermissionRequest, maxSteps, compactionPolicy } = options;

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
  const aiTools = await buildAiSdkTools(toolNames, workspacePath, workspaceId, _sessionId, onPermissionRequest, preconfig.canSpawnSubagents, preconfig.skills);

  // Build system message with workspace context
  let systemMessage = preconfig.systemPrompt || '';

  // Add instructions (global first, then project)
  const instructions = await loadInstructions(workspacePath);
  const instructionsSection = formatInstructions(instructions);
  if (instructionsSection) {
    systemMessage = systemMessage + '\n\n' + instructionsSection;
  }

  // Add workspace context
  if (workspacePath) {
    const workspaceContext = buildWorkspaceSystemPrompt(workspacePath);
    systemMessage = systemMessage + '\n\n' + workspaceContext;
  }

  const { model, useProviderInstructions, omitMaxOutputTokens, providerOptions: baseProviderOptions } =
    await getModelWithMetadata(resolvedModelId, providerId, systemMessage);

  // Convert messages for ai-sdk
  const aiMessages = await convertToAiSdkMessages(messages);

  // Resolve model definition for context window
  const modelDef = resolvedModelId ? findModel(resolvedModelId) : undefined;
  const contextWindow = modelDef?.contextWindow;
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

  // Build providerOptions from model factory result and variant
  let providerOptions: Record<string, Record<string, unknown>> | undefined;
  if (baseProviderOptions) {
    providerOptions = {
      ...baseProviderOptions,
      ...(variantOpts ? { openai: { ...(baseProviderOptions.openai || {}), ...variantOpts } } : {}),
    };
  } else if (variantOpts) {
    providerOptions = { openai: variantOpts };
  }

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
  });

  const toolParts: ToolPart[] = [];
  let _currentText = ''
  let _currentTextPartId: string | null = null;
  let _currentReasoning = ''
  let _currentReasoningPartId: string | null = null;

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

  // Set up the yield function for callbacks
  // Use a queue to handle events from callbacks since we can't yield from inside a callback
  const callbackEventQueue: Array<CallbackEvent> = [];

  stepCtx.yieldFn = (event) => {
    callbackEventQueue.push(event);
  };

  try {
    for await (const delta of result.fullStream) {

      // Check for abort
      if (abortController.signal.aborted) {
        const interruptedMessage: AssistantMessage = {
          ...assistantMessage,
          status: 'error',
          error: 'Interrupted by user',
        };
        yield { type: 'message.updated', message: interruptedMessage };
        updateMessage(messageId, interruptedMessage);
        return;
      }

      // Process any callback events that were queued
      while (callbackEventQueue.length > 0) {
        const event = callbackEventQueue.shift()!;
        yield event;
      }

      switch (delta.type) {
      case 'text-delta': {
        const textContent = delta.text || '';
        if (textContent) {
          _currentText += textContent;

          // Emit part.append event for streaming text
          if (_currentTextPartId) {
            yield { type: 'part.append', sessionId: _sessionId, partId: _currentTextPartId, field: 'text', delta: textContent };
            updatePart(_currentTextPartId, { text: _currentText });
          } else {
            // Create new text part
            _currentTextPartId = randomUUID();
            const textPart: TextPart = {
              id: _currentTextPartId,
              messageId,
              createdAt: Date.now(),
              type: 'text',
              text: textContent,
            };
            yield { type: 'part.created', sessionId: _sessionId, part: textPart };
            createPart(textPart, _sessionId);
          }
        }
        break;
      }

      case 'reasoning-delta': {
        const reasoningContent = delta.text || '';
        if (reasoningContent) {
          _currentReasoning += reasoningContent;

          // Emit part.append event for streaming reasoning
          if (_currentReasoningPartId) {
            yield { type: 'part.append', sessionId: _sessionId, partId: _currentReasoningPartId, field: 'reasoning', delta: reasoningContent };
            updatePart(_currentReasoningPartId, { text: _currentReasoning });
          } else {
            // Create new reasoning part
            _currentReasoningPartId = randomUUID();
            const reasoningPart: ReasoningPart = {
              id: _currentReasoningPartId,
              messageId,
              createdAt: Date.now(),
              type: 'reasoning',
              text: reasoningContent,
            };
            yield { type: 'part.created', sessionId: _sessionId, part: reasoningPart };
            createPart(reasoningPart, _sessionId);
          }
        }
        break;
      }

      case 'tool-call': {
        // Create tool part
        const toolPartId = randomUUID();
        const toolPart: ToolPart = {
          id: toolPartId,
          messageId,
          createdAt: Date.now(),
          type: 'tool',
          callId: delta.toolCallId,
          name: delta.toolName,
          state: {
            status: 'pending',
            input: parseToolInput(delta.input),
          },
        };
        toolParts.push(toolPart);

        // Emit part.created event
        yield { type: 'part.created', sessionId: _sessionId, part: toolPart };
        createPart(toolPart, _sessionId);

        // Reset text tracking so subsequent text creates a new part
        _currentTextPartId = null;
        _currentText = '';
        _currentReasoningPartId = null;
        _currentReasoning = '';
        break;
      }

      case 'tool-result': {
        // AI SDK v6 emits tool-result events after tool execution completes
        // Find the corresponding tool part and update it
        const existingToolPart = toolParts.find((tp) => tp.callId === delta.toolCallId);

        if (existingToolPart) {
          // Get the latest state from database (might have childSessionId from subagent start)
          // The local toolParts array doesn't get updated when transitionToolToRunningByCallId is called
          const latestPart = getPart(existingToolPart.id) as ToolPart | null;
          const latestState = latestPart?.state;

          // Extract the result from the output
          let resultData: unknown;
          if (typeof delta.output === 'string') {
            try {
              resultData = JSON.parse(delta.output);
            } catch {
              resultData = delta.output;
            }
          } else if (delta.output && typeof delta.output === 'object' && 'value' in delta.output) {
            resultData = (delta.output as { value: unknown }).value;
          } else {
            resultData = delta.output;
          }

          // Check if it's an error result
          const isErrorResult = !!(resultData && typeof resultData === 'object' && 'error' in resultData);

          // Preserve childSessionId from the latest database state
          const existingChildSessionId = latestState && 'childSessionId' in latestState
            ? latestState.childSessionId
            : undefined;

          // Update the tool part
          const updatedToolPart: ToolPart = {
            ...existingToolPart,
            state: isErrorResult
              ? {
                  status: 'error' as const,
                  input: existingToolPart.state.input,
                  error: String((resultData as { error: unknown }).error),
                  startedAt: Date.now(),
                  failedAt: Date.now(),
                  ...(existingChildSessionId && { childSessionId: existingChildSessionId }),
                }
              : {
                  status: 'completed' as const,
                  input: existingToolPart.state.input,
                  output: resultData,
                  startedAt: Date.now(),
                  completedAt: Date.now(),
                  ...(existingChildSessionId && { childSessionId: existingChildSessionId }),
                },
          };

          // Update the tool part in our array
          const index = toolParts.indexOf(existingToolPart);
          if (index !== -1) {
            toolParts[index] = updatedToolPart;
          }

          // Emit part.updated event
          yield { type: 'part.updated', sessionId: _sessionId, part: updatedToolPart };
          updatePart(updatedToolPart.id, { state: updatedToolPart.state });
        }
        break;
      }
    }
  }
  } catch (err) {
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
      const interruptedMessage: AssistantMessage = {
        ...assistantMessage,
        status: 'error',
        error: 'Interrupted by user',
      };
      yield { type: 'message.updated', message: interruptedMessage };
      updateMessage(messageId, interruptedMessage);
      return;
    }

    // Handle non-retryable errors - yield error event and return
    if (!classified.retryable) {
      yield createErrorEvent(classified);

      // Update message status to error
      const errorMessage: AssistantMessage = {
        ...assistantMessage,
        status: 'error',
        error: classified.message,
      };
      yield { type: 'message.updated', message: errorMessage };
      updateMessage(messageId, errorMessage);
      return;
    }

    // For retryable errors, throw to let caller handle retry
    throw classified;
  }

  // Finalize: get usage data FIRST, then update message with actual tokens
  let usageData = null;
  try {
    const totalUsagePromise = result.totalUsage;
    const usagePromise = result.usage;
    const [totalUsage, usage] = await Promise.all([totalUsagePromise, usagePromise]);
    usageData = usage ?? totalUsage;
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

  // Cleanup interrupt registration
  interruptManager.unregisterSession(_sessionId);

  // Clear runningAt and broadcast session update for main sessions
  if (isMainSession) {
    updateSession(_sessionId, { runningAt: null });
    const updatedSession = getSession(_sessionId);
    if (updatedSession) {
      broadcastSessionUpdated(updatedSession);
    }
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
