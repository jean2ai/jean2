import { streamText, tool, stepCountIs, jsonSchema, type LanguageModel, type Tool, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { MessageWithParts, Part, TextPart, ToolPart, StepPart, ReasoningPart, Preconfig, ToolExecutionContext, MessageEvent, AssistantMessage, UserMessage } from '@jean2/shared';
import { createMessage, listMessages as storeListMessages, createPart, updatePart, updateMessage, getSession, updateSession, transitionToolToRunningByCallId, getPart } from '@/store';
import { getTool, executeTool, executeToolWithSecurity, hasSecurityCheck } from '@/tools';
import * as mcp from '@/mcp';
import type { PermissionRequestCallback } from '@/tools';
import { findModel, getMaxOutputTokens } from '@/config';
import { buildWorkspaceSystemPrompt } from './prompts/workspace-context';
import { executeSubagent, getSubagentToolDefinition, canSpawnSubagent, type SubagentInput, type SubagentOutput } from './subagent';
import { randomUUID } from 'crypto';
import { createPermissionRequestHandler } from '@/index';
import { interruptManager } from './interrupt';
import { broadcastSessionUpdated } from './broadcast';
import { stripVisualization } from '../utils/strip-visualization';
import { createSkillTool } from '@/skills';

// Structured API keys from environment
const LLM_OPENAI_API_KEY = process.env.LLM_OPENAI_API_KEY;
const LLM_ANTHROPIC_API_KEY = process.env.LLM_ANTHROPIC_API_KEY;
const LLM_OPENROUTER_API_KEY = process.env.LLM_OPENROUTER_API_KEY;
const LLM_GOOGLE_API_KEY = process.env.LLM_GOOGLE_API_KEY;
const LLM_MINIMAX_API_KEY = process.env.LLM_MINIMAX_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.7');

export async function getModel(modelId?: string, providerId?: string): Promise<LanguageModel> {
  // Default model
  const defaultModelId = 'gpt-4o';
  const resolvedModelId = modelId || defaultModelId;

  // If we have a provider from session, use it directly
  let provider = providerId;
  let model = resolvedModelId;

  // Only look up if provider not provided
  if (!provider) {
    const modelInfo = findModel(resolvedModelId);

    if (modelInfo) {
      provider = modelInfo.providerId;
      model = modelInfo.id;
    } else {
      // Fallback: try to parse from model ID string for unknown models
      if (resolvedModelId.includes('/')) {
        provider = 'openrouter';
      } else if (resolvedModelId.startsWith('claude-')) {
        provider = 'anthropic';
      } else if (resolvedModelId.startsWith('gemini-')) {
        provider = 'google';
      } else {
        provider = 'openai';
      }
    }
  }

  // Get API key for the provider
  const getApiKey = () => {
    switch (provider) {
      case 'openai':
        return LLM_OPENAI_API_KEY;
      case 'anthropic':
        return LLM_ANTHROPIC_API_KEY;
      case 'openrouter':
        return LLM_OPENROUTER_API_KEY;
      case 'google':
        return LLM_GOOGLE_API_KEY;
      case 'minimax':
        return LLM_MINIMAX_API_KEY;
      default:
        return LLM_OPENAI_API_KEY;
    }
  };

  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}. Set LLM_${provider.toUpperCase()}_API_KEY environment variable.`);
  }

  switch (provider) {
    case 'openrouter': {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
      const openrouter = createOpenRouter({ apiKey });
      return openrouter.chat(model) as unknown as LanguageModel;
    }

    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic.chat(model) as unknown as LanguageModel;
    }

    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      return google.chat(model) as unknown as LanguageModel;
    }

    case 'minimax': {
      const { createMinimax } = await import('vercel-minimax-ai-provider');
      const minimax = createMinimax({ apiKey });
      return minimax.chat(model) as unknown as LanguageModel;
    }

    case 'openai':
    default: {
      const openai = createOpenAI({
        apiKey,
        baseURL: LLM_BASE_URL || undefined,
      });
      return openai.chat(model) as unknown as LanguageModel;
    }
  }
}

export interface ChatOptions {
  sessionId: string;
  preconfig: Preconfig;
  messages: MessageWithParts[];
  modelId?: string;
  providerId?: string;
  workspacePath?: string;
  workspaceId?: string;
  onPermissionRequest?: PermissionRequestCallback;
  maxSteps?: number;
}

export interface ChatResult {
  message: AssistantMessage;
  toolCalls: ToolPart[];
}

// Type for AI SDK message content
type AiSdkContent = string | Array<{
  type: 'text' | 'tool-call' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  value?: unknown;
  output?: unknown;
}>;

function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === 'tool';
}

/**
 * Safely parses tool input to ensure it's always an object.
 * Handles cases where input might be:
 * - undefined/null -> returns {}
 * - a JSON string -> parses and returns the object, or {} on parse failure
 * - an object -> returns as-is
 */
function parseToolInput(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof input === 'object' ? input as Record<string, unknown> : {};
}

// Helper to create StepPart objects
function createStepPart(options: {
  messageId: string;
  sessionId: string;
  number: number;
  status: 'started' | 'finished';
  finishReason?: 'stop' | 'tool-calls' | 'error' | 'length';
  tokens?: { prompt: number; completion: number };
  cost?: number;
}): StepPart {
  return {
    id: randomUUID(),
    messageId: options.messageId,
    createdAt: Date.now(),
    type: 'step',
    number: options.number,
    status: options.status,
    ...(options.finishReason && { finishReason: options.finishReason }),
    ...(options.tokens && { tokens: options.tokens }),
    ...(options.cost !== undefined && { cost: options.cost }),
  };
}

async function convertToAiSdkMessages(messages: MessageWithParts[]): Promise<ModelMessage[]> {
  const result: { role: 'user' | 'assistant' | 'system' | 'tool'; content: AiSdkContent }[] = [];

  // Process each message
  for (const msgWithParts of messages) {
    const msg = msgWithParts.message;
    const parts = msgWithParts.parts;

    // Separate text and tool parts
    const textBlocks: string[] = [];
    const toolCallBlocks: Array<{
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }> = [];
    const toolResultBlocks: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
    }> = [];

    for (const part of parts) {
      if (isTextPart(part)) {
        textBlocks.push(part.text);
      } else if (isToolPart(part)) {
        const toolPart = part;

        // ALWAYS add tool-call block for ALL tool parts
        toolCallBlocks.push({
          type: 'tool-call' as const,
          toolCallId: toolPart.callId,
          toolName: toolPart.name,
          input: parseToolInput(toolPart.state.input),
        });

        // Add tool-result only for completed or error tools
        if (toolPart.state.status === 'completed') {
          toolResultBlocks.push({
            type: 'tool-result' as const,
            toolCallId: toolPart.callId,
            toolName: toolPart.name,
            output: { type: 'json' as const, value: stripVisualization(toolPart.state.output) },
          });
        } else if (toolPart.state.status === 'error') {
          toolResultBlocks.push({
            type: 'tool-result' as const,
            toolCallId: toolPart.callId,
            toolName: toolPart.name,
            output: { type: 'text' as const, value: JSON.stringify(stripVisualization({ error: toolPart.state.error })) },
          });
        }
        // pending and running tools: only tool-call, no tool-result
      }
      // Ignore other part types (image, file, reasoning, etc.) for AI SDK
    }

    // Determine message type and construct content
    const hasText = textBlocks.length > 0;
    const hasToolCalls = toolCallBlocks.length > 0;

    // Build content parts array for assistant messages with tool calls
    const contentParts: Array<{ type: 'text' | 'tool-call'; text?: string; toolCallId?: string; toolName?: string; input?: unknown }> = [];

    if (hasText) {
      contentParts.push({ type: 'text', text: textBlocks.join('\n\n') });
    }

    // Add all tool calls to the assistant message content
    for (const toolCall of toolCallBlocks) {
      contentParts.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    }

    // Case 1: No tool calls - just text content
    if (!hasToolCalls) {
      const content = textBlocks.join('\n\n');
      result.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
      });
      continue;
    }

    // Case 2: Has tool calls - create assistant message with tool-call blocks
    // Assistant message must include the tool-call declarations
    result.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: contentParts,
    });

    // Case 3: Add tool result messages AFTER the assistant message
    // This is needed for completed/error tools
    for (const toolResult of toolResultBlocks) {
      result.push({
        role: 'tool' as const,
        content: [toolResult],
      });
    }
  }

  return result as unknown as ModelMessage[];
}

async function buildAiSdkTools(
  toolNames: string[],
  workspacePath: string | undefined,
  workspaceId: string | undefined,
  sessionId: string,
  onPermissionRequest?: PermissionRequestCallback,
  canSpawnSubagents?: boolean,
  allowedSkills?: string[] | null
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  // Auto-inject 'task' tool if depth allows and not already present
  const shouldIncludeTask = canSpawnSubagent(sessionId) && !toolNames.includes('task') && (canSpawnSubagents !== false);
  const effectiveToolNames = shouldIncludeTask ? [...toolNames, 'task'] : toolNames;

  for (const name of effectiveToolNames) {
    // Special handling for 'task' tool - use subagent instead of regular tool executor
    if (name === 'task') {
      const subagentDefinition = await getSubagentToolDefinition();

      tools[name] = tool({
        description: subagentDefinition.description,
        inputSchema: jsonSchema(subagentDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          // Register tool execution with interrupt manager
          const toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);

          try {
            // Build subagent input with required fields from context
            const subagentInput: SubagentInput = {
              description: args.description as string,
              prompt: args.prompt as string,
              subagent_type: args.subagent_type as string,
              task_id: args.task_id as string | undefined,
              sessionId,
              workspaceId,
              workspacePath,
              abortSignal: toolAbortController.signal,
              onSessionCreated: (childSessionId: string) => {
                transitionToolToRunningByCallId(sessionId, toolCallId, childSessionId);
              },
            };

            const result = await executeSubagent(subagentInput);
            return result as SubagentOutput;
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
          }
        },
      });
      continue;
    }

    const discoveredTool = await getTool(name);
    if (!discoveredTool) continue;

    const { definition } = discoveredTool;

    tools[name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
        // Register tool execution with interrupt manager
        const toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);

        try {
          // Build execution context
          const context: ToolExecutionContext = {
            workspacePath,
            sessionId,
            workspaceId,
          };

          // If tool has security check, use enhanced executor
          if (hasSecurityCheck(discoveredTool)) {
            const result = await executeToolWithSecurity({
              tool: discoveredTool,
              args,
              context,
              toolCallId,
              onPermissionRequest,
              abortSignal: toolAbortController.signal,
            });

            if (!result.success) {
              // Check if it was a user rejection
              if (result.error === 'USER_REJECTION' || result.permissionGranted === false) {
                return {
                  error: 'USER_REJECTION',
                  message: `The user denied permission to execute this tool (${name}). ` +
                           `Do NOT retry this tool call. Acknowledge this rejection and ask what they would like to do instead.`,
                  toolName: name,
                  args,
                };
              }

              // Check for interrupt
              if (result.interrupted) {
                return {
                  error: 'INTERRUPTED',
                  message: `Tool execution was interrupted`,
                  toolName: name,
                  args,
                  partialOutput: result.partialOutput,
                };
              }

              return { error: result.error };
            }

            return result.result;
          }

          // Execute the tool with workspacePath
          const execResult = await executeTool({
            tool: discoveredTool,
            args,
            workspacePath,
            sessionId,
            toolCallId,
            abortSignal: toolAbortController.signal,
          });

          if (!execResult.success) {
            // Check for interrupt
            if (execResult.interrupted) {
              return {
                error: 'INTERRUPTED',
                message: `Tool execution was interrupted`,
                toolName: name,
                args,
                partialOutput: execResult.partialOutput,
              };
            }
            return { error: execResult.error };
          }

          return execResult.result;
        } finally {
          // Cleanup tool registration
          interruptManager.unregisterToolExecution(sessionId, toolCallId);
        }
      },
    });
  }

  // Add skill tool if workspace is available and skills are allowed
  if (workspacePath) {
    const skillTool = await createSkillTool(workspacePath, allowedSkills);
    if (skillTool) {
      tools[skillTool.name] = skillTool.tool;
    }
  }

  // Add MCP tools if workspace is available
  if (workspacePath) {
    try {
      const mcpTools = await mcp.getTools(workspacePath);
      Object.assign(tools, mcpTools);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
      // Continue without MCP tools - don't block the agent
    }
  }

  return tools;
}

export async function* streamChat(options: ChatOptions): AsyncGenerator<MessageEvent | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string }> {
  const { sessionId: _sessionId, preconfig, messages, modelId, providerId, workspacePath, workspaceId, onPermissionRequest, maxSteps } = options;

  // Register session with interrupt manager
  const abortController = interruptManager.registerSession(_sessionId);

  // Initialize MCP for workspace
  if (workspacePath) {
    mcp.initializeWorkspace(workspacePath).catch((err) => {
      console.error('Failed to initialize MCP:', err);
    });
  }

  // Check if this is a main session (not a subagent) and set runningAt
  const session = getSession(_sessionId);
  const isMainSession = session && !session.parentId;
  if (isMainSession) {
    updateSession(_sessionId, { runningAt: new Date().toISOString() });
  }

  // Resolve model: session override > preconfig > env default
  const resolvedModelId = modelId || (preconfig.model ?? undefined);
  const model = await getModel(resolvedModelId, providerId);

  const toolNames = preconfig.tools || [];
  const aiTools = await buildAiSdkTools(toolNames, workspacePath, workspaceId, _sessionId, onPermissionRequest, preconfig.canSpawnSubagents, preconfig.skills);

  // Build system message with workspace context
  let systemMessage = preconfig.systemPrompt || '';

  if (workspacePath) {
    const workspaceContext = buildWorkspaceSystemPrompt(workspacePath);
    systemMessage = systemMessage + '\n\n' + workspaceContext;
  }

  // Convert messages for ai-sdk
  const aiMessages = await convertToAiSdkMessages(messages);

  // Variables to track step parts for yielding from callbacks
  const stepParts: StepPart[] = [];
  const messageId = randomUUID();
  let yieldFn: ((event: MessageEvent) => void) | null = null;

  // Create a deferred yield function that will be set up after we enter the generator
  const result = streamText({
    model,
    system: systemMessage,
    messages: aiMessages,
    tools: aiTools,
    maxOutputTokens: getMaxOutputTokens(resolvedModelId),
    temperature: (preconfig.settings?.temperature ?? LLM_TEMPERATURE) as number,
    stopWhen: stepCountIs(maxSteps ?? 10),
    abortSignal: abortController.signal,
    // Use callbacks for step tracking
    experimental_onStepStart: (stepStartEvent) => {
      // Create step started part
      const stepNumber = stepStartEvent.stepNumber + 1; // Convert to 1-indexed

      const startedStepPart = createStepPart({
        messageId,
        sessionId: _sessionId,
        number: stepNumber,
        status: 'started',
      });
      stepParts.push(startedStepPart);

      // Emit part.created event via yield function
      if (yieldFn) {
        yieldFn({ type: 'part.created', sessionId: _sessionId, part: startedStepPart });
      }
      createPart(startedStepPart, _sessionId);
    },
    onStepFinish: (stepFinishEvent) => {
      // stepFinishEvent contains: stepNumber, finishReason, usage, totalUsage
      const stepNumber = stepFinishEvent.stepNumber + 1; // Convert to 1-indexed

      // Get step-level usage
      const stepUsage = stepFinishEvent.usage;
      const stepPromptTokens = stepUsage?.inputTokens ?? 0;
      const stepCompletionTokens = stepUsage?.outputTokens ?? 0;

      // Map AI SDK finish reason to our type
      let finishReason: 'stop' | 'tool-calls' | 'error' | 'length' | undefined;
      if (stepFinishEvent.finishReason) {
        if (stepFinishEvent.finishReason === 'stop') {
          finishReason = 'stop';
        } else if (stepFinishEvent.finishReason === 'tool-calls') {
          finishReason = 'tool-calls';
        } else if (stepFinishEvent.finishReason === 'length') {
          finishReason = 'length';
        } else if (stepFinishEvent.finishReason === 'error' || stepFinishEvent.finishReason === 'other') {
          finishReason = 'error';
        }
      }

      const finishedStepPart = createStepPart({
        messageId,
        sessionId: _sessionId,
        number: stepNumber,
        status: 'finished',
        finishReason,
        tokens: {
          prompt: stepPromptTokens,
          completion: stepCompletionTokens,
        },
      });

      // Update the step part in our array
      const existingStepPart = stepParts.find(sp => sp.number === stepNumber);
      if (existingStepPart) {
        const index = stepParts.indexOf(existingStepPart);
        stepParts[index] = finishedStepPart;
      } else {
        stepParts.push(finishedStepPart);
      }

      // Emit part.updated event
      if (yieldFn) {
        yieldFn({ type: 'part.updated', sessionId: _sessionId, part: finishedStepPart });
      }
      updatePart(finishedStepPart.id, {
        finishReason: finishedStepPart.finishReason,
        tokens: finishedStepPart.tokens,
      });
    },
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
  const callbackEventQueue: MessageEvent[] = [];

  yieldFn = (event: MessageEvent) => {
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

  // Finalize: get usage data FIRST, then update message with actual tokens
  const totalUsagePromise = result.totalUsage;
  const usagePromise = result.usage;

  const [totalUsage, usage] = await Promise.all([totalUsagePromise, usagePromise]);
  const usageData = usage ?? totalUsage;

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
        promptTokens: usageData.inputTokens ?? 0,
        completionTokens: usageData.outputTokens ?? 0,
        totalTokens: usageData.totalTokens ?? 0,
      },
      model: actualModelId,
    };
  }
  } finally {
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

/**
 * Execute a child session synchronously (for Task tool)
 * Returns the final message content without streaming to client
 */
export async function executeChildSession(options: {
  parentSessionId: string;
  childSessionId: string;
  preconfig: Preconfig;
  prompt: string;
  workspacePath?: string;
  workspaceId?: string;
  resumeFromHistory?: boolean;
  modelId?: string | null;
  providerId?: string | null;
}): Promise<{
  parts: Part[];
  error?: string;
}> {
  const { childSessionId, preconfig, prompt, workspacePath, workspaceId, resumeFromHistory, modelId, providerId } = options;

  // Build initial message with parts
  let messages: MessageWithParts[];

  if (resumeFromHistory) {
    // Load existing messages and append new prompt
    const existingMessages = storeListMessages(childSessionId);
    messages = existingMessages.map((msg) => ({
      message: msg,
      parts: [],
    }));

    // Add new user message with text part
    const newMsgId = randomUUID();
    const newMessage: UserMessage = {
      id: newMsgId,
      sessionId: childSessionId,
      role: 'user',
      createdAt: Date.now(),
    };
    const textPart: TextPart = {
      id: randomUUID(),
      messageId: newMsgId,
      createdAt: Date.now(),
      type: 'text',
      text: prompt,
    };
    messages.push({ message: newMessage, parts: [textPart] });
    createPart(textPart, childSessionId);
  } else {
    // Start fresh with user message
    const msgId = randomUUID();
    const userMessage: UserMessage = {
      id: msgId,
      sessionId: childSessionId,
      role: 'user',
      createdAt: Date.now(),
    };
    const textPart: TextPart = {
      id: randomUUID(),
      messageId: msgId,
      createdAt: Date.now(),
      type: 'text',
      text: prompt,
    };
    messages = [{ message: userMessage, parts: [textPart] }];
    createPart(textPart, childSessionId);
  }

  // Store the user message - pass the full message object
  const userMessage = messages[messages.length - 1].message;
  createMessage(userMessage);

  const finalParts: Part[] = [];
  let error: string | undefined;

  try {
    // Run the agent loop without streaming callbacks
    for await (const event of streamChat({
      sessionId: childSessionId,
      preconfig,
      messages,
      workspacePath,
      workspaceId,
      modelId: modelId ?? undefined,
      providerId: providerId ?? undefined,
      maxSteps: 50,
      // Route permission requests through parent session for approval
      onPermissionRequest: createPermissionRequestHandler(childSessionId),
    })) {
    if (event.type === 'part.created') {
      finalParts.push(event.part);
    } else if (event.type === 'part.append' && event.field === 'text') {
      const part = finalParts.find(p => p.id === event.partId);
      if (part && part.type === 'text') {
        part.text = (part.text || '') + event.delta;
      }
    } else if (event.type === 'message.updated' && event.message.role === 'assistant') {
      updateMessage(event.message.id, event.message);
    } else if (event.type === 'usage') {
      // Update child session token totals
      const currentSession = getSession(childSessionId);
      if (currentSession) {
        updateSession(childSessionId, {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        });
      }
    }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error(`[Child Session ${childSessionId}] Error:`, error);
  }

  return {
    parts: finalParts,
    error,
  };
}
