import { streamText, tool, stepCountIs, jsonSchema, type LanguageModel, type Tool, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Message, ContentBlock, ToolCallBlock, Preconfig, ToolExecutionContext } from '@jean2/shared';
import { getTool, executeTool, executeToolWithSecurity, hasSecurityCheck } from '@/tools';
import type { PermissionRequestCallback } from '@/tools';
import { findModel } from '@/config';
import { randomUUID } from 'crypto';

// Structured API keys from environment
const LLM_OPENAI_API_KEY = process.env.LLM_OPENAI_API_KEY;
const LLM_ANTHROPIC_API_KEY = process.env.LLM_ANTHROPIC_API_KEY;
const LLM_OPENROUTER_API_KEY = process.env.LLM_OPENROUTER_API_KEY;
const LLM_GOOGLE_API_KEY = process.env.LLM_GOOGLE_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '4096', 10);
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.7');

async function getModel(modelId?: string, providerId?: string): Promise<LanguageModel> {
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
      // (this handles cases where model isn't in our config)
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
      return anthropic(model) as unknown as LanguageModel;
    }

    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model) as unknown as LanguageModel;
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
  messages: Message[];
  modelId?: string;  // Override model from session/preconfig
  providerId?: string;  // Directly from session
  workspacePath?: string;  // Workspace path for tool execution
  workspaceId?: string;  // NEW: workspace ID for permission caching
  onDelta?: (delta: string) => void;
  onToolCall?: (toolCall: ToolCallBlock) => void;
  onToolApprovalRequired?: (toolCall: ToolCallBlock, dangerous: boolean) => Promise<boolean>;
  onPermissionRequest?: PermissionRequestCallback;  // NEW: permission callback
}

export interface ChatResult {
  message: Message;
  toolCalls: ToolCallBlock[];
}

// Type for AI SDK message content - can be string or array of content parts
type AiSdkContent = string | Array<{
  type: 'text' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  value?: unknown;
}>;

async function convertToAiSdkMessages(messages: Message[]): Promise<ModelMessage[]> {
  const result: { role: 'user' | 'assistant' | 'system' | 'tool'; content: AiSdkContent }[] = [];

  // First, build a map of toolCallId -> toolName from all messages
  const toolCallIdToName: Record<string, string> = {};
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_call') {
        toolCallIdToName[block.toolCallId] = block.toolName;
      }
    }
  }

  // Then process messages as before
  for (const msg of messages) {
    // Separate text and tool_result blocks
    const textBlocks: string[] = [];
    const toolResultBlocks: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
    }> = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_call') {
        // Track the tool name for this tool call ID
        toolCallIdToName[block.toolCallId] = block.toolName;
      } else if (block.type === 'tool_result') {
        // AI SDK v6 requires output to be wrapped in ToolResultOutput format
        const output = block.isError
          ? { type: 'text' as const, value: JSON.stringify(block.result) }
          : { type: 'json' as const, value: block.result };

        toolResultBlocks.push({
          type: 'tool-result' as const,
          toolCallId: block.toolCallId,
          toolName: block.toolName,
          output,
        });
      }
      // Ignore other block types (image) for AI SDK message conversion
    }

    // If there are no tool result blocks, keep the original role
    if (toolResultBlocks.length === 0) {
      const content = textBlocks.join('\n\n');
      result.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
      });
      continue;
    }

    // If there are only tool result blocks (no text), use role: "tool"
    if (textBlocks.length === 0) {
      // AI SDK expects each tool result as a separate message
      for (const toolResult of toolResultBlocks) {
        result.push({
          role: 'tool' as const,
          content: [toolResult],
        });
      }
      continue;
    }

    // Mixed content: text + tool_result
    // First add the text as the original role message
    if (textBlocks.length > 0) {
      const textContent = textBlocks.join('\n\n');
      result.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: textContent,
      });
    }

    // Then add each tool result as separate tool messages
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
  onToolApprovalRequired?: (toolCall: ToolCallBlock, dangerous: boolean) => Promise<boolean>,
  onPermissionRequest?: PermissionRequestCallback
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  for (const name of toolNames) {
    const discoveredTool = await getTool(name);
    if (!discoveredTool) continue;

    const { definition } = discoveredTool;
    const needsApproval = definition.requireApproval;

    tools[name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      // Don't use AI SDK's needsApproval - we handle approval ourselves in execute
      // needsApproval,
      execute: async (args: Record<string, unknown>) => {
        const toolCall: ToolCallBlock = {
          type: 'tool_call',
          toolCallId: randomUUID(),
          toolName: name,
          args,
        };

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
            onPermissionRequest,
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
            return { error: result.error };
          }

          return result.result;
        }

        // Fall back to legacy approval handling for tools without security check
        if (needsApproval && onToolApprovalRequired) {
          const approved = await onToolApprovalRequired(toolCall, definition.dangerous);
          if (!approved) {
            return {
              error: 'USER_REJECTION',
              message: `The user explicitly denied permission to execute this tool (${name}). ` +
                       `Do NOT retry this tool call or similar variations. ` +
                       `Acknowledge this rejection to the user and ask what they would like to do instead.`,
              toolName: name,
              args,
            };
          }
        } else if (needsApproval && !onToolApprovalRequired) {
          return {
            error: 'USER_REJECTION',
            message: `No approval callback was configured, so the tool (${name}) could not be executed.`,
            toolName: name,
            args,
          };
        }

        // Execute the tool with workspacePath
        const execResult = await executeTool({ tool: discoveredTool, args, workspacePath });
        if (!execResult.success) {
          return { error: execResult.error };
        }

        return execResult.result;
      },
    });
  }

  return tools;
}

export async function* streamChat(options: ChatOptions): AsyncGenerator<
  | { type: 'delta'; content: string }
  | { type: 'tool_call'; toolCall: ToolCallBlock }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'approval_required'; toolCall: ToolCallBlock; dangerous: boolean }
  | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string }
  | { type: 'complete'; message: Message }
> {
  const { sessionId: _sessionId, preconfig, messages, onToolApprovalRequired, modelId, providerId, workspacePath, workspaceId, onPermissionRequest } = options;

  // Resolve model: session override > preconfig > env default
  const resolvedModelId = modelId || (preconfig.model ?? undefined);
  const model = await getModel(resolvedModelId, providerId);

  const toolNames = preconfig.tools || [];
  const aiTools = await buildAiSdkTools(toolNames, workspacePath, workspaceId, _sessionId, onToolApprovalRequired, onPermissionRequest);

  // Build system message
  const systemMessage = preconfig.systemPrompt;

  // Convert messages for ai-sdk
  const aiMessages = await convertToAiSdkMessages(messages);

  const result = streamText({
    model,
    system: systemMessage,
    messages: aiMessages,
    tools: aiTools,
    maxOutputTokens: LLM_MAX_TOKENS,
    temperature: (preconfig.settings?.temperature ?? LLM_TEMPERATURE) as number,
    stopWhen: stepCountIs(10),
  });

  const contentBlocks: ContentBlock[] = [];
  const toolCalls: ToolCallBlock[] = [];
  let currentText = '';
  const messageId = randomUUID();

  for await (const delta of result.fullStream) {

    switch (delta.type) {
      case 'text-delta': {
        const textContent = delta.text || '';
        if (textContent) {
          currentText += textContent;
          yield { type: 'delta', content: textContent };
        }
        break;
      }

      case 'tool-call': {
        // Flush any pending text before adding the tool call
        if (currentText) {
          contentBlocks.push({ type: 'text', text: currentText });
          currentText = '';
        }

        const toolCall: ToolCallBlock = {
          type: 'tool_call',
          toolCallId: delta.toolCallId,
          toolName: delta.toolName,
          args: delta.input as Record<string, unknown>,
        };
        toolCalls.push(toolCall);

        // Yield the tool_call event first
        yield { type: 'tool_call', toolCall };

        // Also add to contentBlocks for the final message
        contentBlocks.push(toolCall);

        // Note: Approval and execution are now handled in the tool's execute function
        // via the needsApproval option. The SDK will call execute after emitting tool-call.
        // We don't need to manually execute here anymore.
        break;
      }

      case 'tool-result': {
        // AI SDK v6 emits tool-result events after tool execution completes
        // Extract the result from the output
        let result: unknown;
        if (typeof delta.output === 'string') {
          try {
            result = JSON.parse(delta.output);
          } catch {
            result = delta.output;
          }
        } else if (delta.output && typeof delta.output === 'object' && 'value' in delta.output) {
          // AI SDK wraps JSON output in a ToolResultOutput object
          result = (delta.output as { value: unknown }).value;
        } else {
          result = delta.output;
        }

        // Yield the tool_result event for streaming to client
        yield {
          type: 'tool_result',
          toolCallId: delta.toolCallId,
          toolName: delta.toolName,
          result,
        };

        // Also add to contentBlocks for the final message
        const isErrorResult = !!(result && typeof result === 'object' && 'error' in result);
        contentBlocks.push({
          type: 'tool_result',
          toolCallId: delta.toolCallId,
          toolName: delta.toolName,
          result,
          isError: isErrorResult,
        });
        break;
      }
    }
  }

  // Finalize text block - push (append) any remaining text, don't prepend
  if (currentText) {
    contentBlocks.push({ type: 'text', text: currentText });
  }

  // Capture and yield token usage information
  // Prefer totalUsage for multi-step generations (when tool calls cause multiple steps)
  const totalUsagePromise = result.totalUsage;
  const usagePromise = result.usage;

  // Await both promises to get the values
  const [totalUsage, usage] = await Promise.all([totalUsagePromise, usagePromise]);
  const usageData = totalUsage ?? usage;

  if (usageData) {
    // Use resolvedModelId directly if provided, otherwise default to 'gpt-4o'
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

  const finalMessage: Message = {
    id: messageId,
    role: 'assistant',
    content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: '' }],
    createdAt: new Date().toISOString(),
  };

  yield { type: 'complete', message: finalMessage };
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  let finalMessage: Message | null = null;
  const toolCalls: ToolCallBlock[] = [];

  for await (const event of streamChat(options)) {
    if (event.type === 'tool_call') {
      toolCalls.push(event.toolCall);
    }
    if (event.type === 'complete') {
      finalMessage = event.message;
    }
  }

  return {
    message: finalMessage!,
    toolCalls,
  };
}
