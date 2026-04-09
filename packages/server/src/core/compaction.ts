import { generateText, streamText } from 'ai';
import { getModel } from './model-utils';
import { findModel } from '@/config';
import {
  listMessagesWithParts,
  createPart,
  createMessage,
  updatePart,
  getPartsBySession,
  buildEffectiveContextHistory,
} from '@/store';
import { broadcastEvent } from './broadcast';
import type { MessageWithParts, CompactionPart, TextPart, AssistantMessage, ToolPart } from '@jean2/sdk';
import { randomUUID } from 'crypto';
import {
  getCompactionModel,
  getCompactionProvider,
  getCompactionMaxTokens,
  getCompactionPreserveRecentToolCount,
  getCompactionPreserveSmallToolChars,
  getCompactionToolClearCharsThreshold,
  getCompactionMaxPrunedToolCount,
  getCompactionAutoThresholdRatio,
  getCompactionAutoReserveCapTokens,
  getCompactionAutoSafetyMarginTokens,
} from '@/env';

/**
 * Compaction trigger reasons
 */
export type CompactionTriggerReason = 'manual' | 'auto' | 'overflow';

/**
 * Compaction policy for configuring summary generation.
 * All model/provider fields are optional - null means "use session/default".
 * Pruning fields control which tool outputs get marked as compacted.
 * Auto-threshold fields control the hybrid formula for pre-overflow compaction.
 */
export interface CompactionPolicy {
  modelId: string | null;
  providerId: string | null;
  maxOutputTokens: number;
  overflowThresholdRatio: number | null;
  // WS4: Budget-aware pruning knobs
  preserveRecentToolCount: number;
  preserveSmallToolChars: number;
  toolClearCharsThreshold: number;
  maxPrunedToolCount: number;
  // Hybrid formula for auto-compaction threshold
  autoThresholdRatio: number;
  autoReserveCapTokens: number;
  autoSafetyMarginTokens: number;
}

/**
 * Default compaction policy with legacy-compatible defaults.
 */
export function getDefaultCompactionPolicy(): CompactionPolicy {
  return {
    modelId: null,
    providerId: null,
    maxOutputTokens: getCompactionMaxTokens(),
    overflowThresholdRatio: null,
    // WS4: Budget-aware pruning defaults
    preserveRecentToolCount: getCompactionPreserveRecentToolCount(),
    preserveSmallToolChars: getCompactionPreserveSmallToolChars(),
    toolClearCharsThreshold: getCompactionToolClearCharsThreshold(),
    maxPrunedToolCount: getCompactionMaxPrunedToolCount(),
    // Hybrid formula defaults
    autoThresholdRatio: getCompactionAutoThresholdRatio(),
    autoReserveCapTokens: getCompactionAutoReserveCapTokens(),
    autoSafetyMarginTokens: getCompactionAutoSafetyMarginTokens(),
  };
}

/**
 * Resolve a CompactionPolicy from optional overrides and session defaults.
 * Env vars take precedence, then session values, then defaults.
 */
export function resolveCompactionPolicy(
  sessionModelId: string | undefined,
  sessionProviderId: string | undefined,
  overrides?: Partial<CompactionPolicy>,
): CompactionPolicy {
  const defaults = getDefaultCompactionPolicy();

  return {
    modelId: getCompactionModel() ?? overrides?.modelId ?? sessionModelId ?? defaults.modelId,
    providerId: getCompactionProvider() ?? overrides?.providerId ?? sessionProviderId ?? defaults.providerId,
    maxOutputTokens: overrides?.maxOutputTokens ?? defaults.maxOutputTokens,
    overflowThresholdRatio: overrides?.overflowThresholdRatio ?? defaults.overflowThresholdRatio,
    // WS4: Budget-aware pruning - env takes precedence, then overrides, then defaults
    preserveRecentToolCount: overrides?.preserveRecentToolCount ?? defaults.preserveRecentToolCount,
    preserveSmallToolChars: overrides?.preserveSmallToolChars ?? defaults.preserveSmallToolChars,
    toolClearCharsThreshold: overrides?.toolClearCharsThreshold ?? defaults.toolClearCharsThreshold,
    maxPrunedToolCount: overrides?.maxPrunedToolCount ?? defaults.maxPrunedToolCount,
    // Hybrid formula - env takes precedence, then overrides, then defaults
    autoThresholdRatio: overrides?.autoThresholdRatio ?? defaults.autoThresholdRatio,
    autoReserveCapTokens: overrides?.autoReserveCapTokens ?? defaults.autoReserveCapTokens,
    autoSafetyMarginTokens: overrides?.autoSafetyMarginTokens ?? defaults.autoSafetyMarginTokens,
  };
}

/**
 * Trigger created before compaction.
 * The trigger is a user message with a standard CompactionPart.
 */
export interface CompactionTrigger {
  messageId: string;
  reason: CompactionTriggerReason;
}

/**
 * Compaction task result
 */
export interface CompactionTaskResult {
  trigger: CompactionTrigger;
  summaryMessage: AssistantMessage;
  textParts: TextPart[];
  tokensUsed: {
    prompt: number;
    completion: number;
  };
}

const COMPACTION_PROMPT_FIRST = `Summarize the following conversation for context continuity.

Structure your response with these sections:
- **Decisions**: Key choices made and rationale
- **Changes**: Files/functions created or modified (with paths)
- **Context**: Important state, configurations, or patterns established
- **Open items**: Unresolved issues or planned next steps

Be specific with file paths, function names, and technical details.

Conversation to summarize:

{CONVERSATION}`;

const COMPACTION_PROMPT_INCREMENTAL = `The following is a previous conversation summary, followed by new messages since that summary.

Produce an UPDATED summary that incorporates the new information. Keep it concise and structured.

Structure your response with these sections:
- **Decisions**: Key choices made and rationale
- **Changes**: Files/functions created or modified (with paths)
- **Context**: Important state, configurations, or patterns established
- **Open items**: Unresolved issues or planned next steps

Previous summary:
{PREVIOUS_SUMMARY}

New messages since that summary:
{CONVERSATION}`;

/**
 * Find the previous summary text from the latest compaction summary message.
 * Returns null if no previous summary exists.
 */
function getPreviousSummary(sessionId: string): string | null {
  const allMessages = listMessagesWithParts(sessionId);

  // Find the MOST RECENT assistant message with summary=true and mode='compaction'
  // (use reduceRight instead of find to get the latest, not the oldest)
  const latestSummaryMsg = allMessages.reduceRight<typeof allMessages[0] | null>(
    (found, m) =>
      found
        ? found
        : m.message.role === 'assistant' &&
          (m.message as AssistantMessage).summary === true &&
          (m.message as AssistantMessage).mode === 'compaction'
          ? m
          : null,
    null,
  );

  if (!latestSummaryMsg) {
    return null;
  }

  // Extract text from text parts
  const textParts = latestSummaryMsg.parts.filter((p) => p.type === 'text');
  if (textParts.length === 0) {
    return null;
  }

  return textParts.map((p) => (p as { text: string }).text).join('\n');
}

/**
 * Creates a compaction trigger message and returns it.
 * The trigger is persisted to the database as a user message with a standard CompactionPart.
 */
export function createCompactionTrigger(
  sessionId: string,
  reason: CompactionTriggerReason,
): CompactionTrigger {
  // Simple meaningful validation: there must be at least 2 non-system messages
  // (at minimum one user turn + one assistant turn to have meaningful content)
  const { messages: effectiveHistory } = buildEffectiveContextHistory(sessionId);
  const nonSystemCount = effectiveHistory.filter(
    (m) => m.message.role !== 'system',
  ).length;

  if (nonSystemCount < 2) {
    throw new Error('Not enough messages for compaction (need at least a user and assistant turn)');
  }

  const triggerMessageId = randomUUID();
  const now = Date.now();

  // Create a trigger message (user role to indicate it came from the user/system)
  const triggerMessage = {
    id: triggerMessageId,
    sessionId,
    role: 'user' as const,
    createdAt: now,
    partIds: [],
  };

  createMessage(triggerMessage);

  // Create a standard CompactionPart (metadata-only per spec)
  const compactionPart: CompactionPart = {
    id: randomUUID(),
    messageId: triggerMessageId,
    createdAt: now,
    type: 'compaction',
    auto: reason !== 'manual',
    overflow: reason === 'overflow',
  };

  createPart(compactionPart, sessionId);

  return {
    messageId: triggerMessageId,
    reason,
  };
}

function buildConversationText(messages: MessageWithParts[]): string {
  const lines: string[] = [];

  for (const { message, parts } of messages) {
    if (message.role === 'system') continue;

    lines.push(`\n--- ${message.role.toUpperCase()} ---`);

    for (const part of parts) {
      if (part.type === 'text') {
        lines.push((part as { text: string }).text);
      } else if (part.type === 'tool') {
        const toolPart = part as {
          name: string;
          state: { input: unknown; output?: unknown; status: string; error?: string };
        };
        lines.push(`\n[TOOL: ${toolPart.name}]`);
        lines.push(`Input: ${JSON.stringify(toolPart.state.input, null, 2)}`);
        if (toolPart.state.status === 'completed') {
          lines.push(`Output: ${formatOutput(toolPart.state.output)}`);
        } else if (toolPart.state.status === 'error') {
          lines.push(`Error: ${toolPart.state.error}`);
        }
      }
    }
  }

  return lines.join('\n');
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.length > 500
      ? output.slice(0, 500) + '...(truncated)'
      : output;
  }
  const str = JSON.stringify(output, null, 2);
  return str.length > 500 ? str.slice(0, 500) + '...(truncated)' : str;
}

/**
 * Estimate the character size of a tool's output.
 * Uses cheap serialization - no need for accurate tokenization here.
 */
function estimateToolOutputSize(output: unknown): number {
  if (output === null || output === undefined) {
    return 0;
  }
  if (typeof output === 'string') {
    return output.length;
  }
  // For objects/arrays, serialize to JSON and measure
  try {
    return JSON.stringify(output).length;
  } catch {
    return 0;
  }
}

/**
 * Mark tool results as compacted after a successful compaction.
 * WS4: Budget-aware pruning - selectively marks tools based on policy.
 *
 * Pruning strategy:
 * 1. Always protect 'skill' tool outputs
 * 2. Protect small outputs (below preserveSmallToolChars)
 * 3. Protect the N most recent eligible tools (preserveRecentToolCount)
 * 4. Clear older/larger outputs that exceed toolClearCharsThreshold
 * 5. Respect maxPrunedToolCount limit
 *
 * This preserves important recent context while still reducing context size
 * for older, larger tool outputs that are less likely to be relevant.
 */
function markToolsAsCompacted(
  sessionId: string,
  compactedMessageIds: string[],
  policy: CompactionPolicy,
): void {
  const allParts = getPartsBySession(sessionId);
  const now = Date.now();

  // Gather eligible completed tool parts within compacted messages
  const eligibleTools: Array<{
    part: ToolPart;
    outputSize: number;
    createdAt: number;
  }> = [];

  for (const part of allParts) {
    if (part.type !== 'tool') continue;

    const toolPart = part as ToolPart;

    // Skip non-completed tools
    if (toolPart.state.status !== 'completed') continue;

    // Skip tools not in compacted messages
    if (!compactedMessageIds.includes(toolPart.messageId)) continue;

    // Always protect skill tool outputs
    if (toolPart.name === 'skill') continue;

    // Estimate output size
    const outputSize = estimateToolOutputSize((toolPart.state as { output?: unknown }).output);

    // Protect small outputs below threshold
    if (outputSize <= policy.preserveSmallToolChars) continue;

    eligibleTools.push({
      part: toolPart,
      outputSize,
      createdAt: part.createdAt,
    });
  }

  // Sort by createdAt descending (most recent first)
  eligibleTools.sort((a, b) => b.createdAt - a.createdAt);

  // Skip the N most recent eligible tools (preserveRecentToolCount) - they stay protected.
  // The remainder (older tools) become candidates for pruning.
  // Process candidates from oldest to newest to be conservative about what gets cleared.
  const candidatesForPruning = eligibleTools
    .slice(policy.preserveRecentToolCount)
    .sort((a, b) => a.createdAt - b.createdAt);

  // Apply maxPrunedToolCount limit - only prune up to this many tools
  const toolsToPrune = candidatesForPruning.slice(0, policy.maxPrunedToolCount);

  // Mark older/larger tools as compacted
  for (const candidate of toolsToPrune) {
    // Only clear tools that exceed the clear threshold
    // (already know they exceed preserveSmallToolChars since we filtered above)
    if (candidate.outputSize > policy.toolClearCharsThreshold) {
      updatePart(candidate.part.id, {
        state: {
          ...candidate.part.state,
          compactedAt: now,
        },
      });
    }
  }
}

/**
 * Processes a compaction task from a trigger message.
 * Creates an assistant message with the summary text.
 */
export async function processCompactionTask(
  sessionId: string,
  triggerMessageId: string,
  policy: CompactionPolicy,
): Promise<CompactionTaskResult> {
  // Get the trigger message
  const allMessages = listMessagesWithParts(sessionId);
  const triggerMsgWithParts = allMessages.find((m) => m.message.id === triggerMessageId);

  if (!triggerMsgWithParts) {
    throw new Error('Trigger message not found');
  }

  // Get the CompactionPart to determine reason
  const triggerPart = triggerMsgWithParts.parts.find((p) => p.type === 'compaction');
  if (!triggerPart) {
    throw new Error('Trigger message does not have a compaction part');
  }

  const compactionPart = triggerPart as CompactionPart;
  const reason: CompactionTriggerReason = compactionPart.overflow
    ? 'overflow'
    : compactionPart.auto
      ? 'auto'
      : 'manual';

  // Get the trigger message's boundary (all messages before the trigger)
  // Find the index of the trigger in the full session history
  const triggerIdx = allMessages.findIndex((m) => m.message.id === triggerMessageId);

  // Get messages to compact (everything before the trigger, excluding system)
  const messagesToCompact = allMessages
    .slice(0, triggerIdx)
    .filter((m) => m.message.role !== 'system');

  if (messagesToCompact.length === 0) {
    throw new Error('No messages to compact');
  }

  // Validate: there must be at least one user message to serve as a meaningful boundary.
  // This replaces the fragile hasNestedCompaction guard.
  const hasUserMessage = messagesToCompact.some(
    (m) => m.message.role === 'user',
  );
  if (!hasUserMessage) {
    throw new Error('Compaction boundary must contain at least one user message');
  }

  // Build the prompt
  const conversationText = buildConversationText(messagesToCompact);
  const previousSummary = getPreviousSummary(sessionId);

  const prompt = previousSummary
    ? COMPACTION_PROMPT_INCREMENTAL
        .replace('{PREVIOUS_SUMMARY}', previousSummary)
        .replace('{CONVERSATION}', conversationText)
    : COMPACTION_PROMPT_FIRST.replace('{CONVERSATION}', conversationText);

  console.log('[compaction] modelId:', policy.modelId, 'providerId:', policy.providerId);

  const model = await getModel(policy.modelId ?? undefined, policy.providerId ?? undefined);

  // Resolve effective modelId/providerId - same logic as getModelWithMetadata in agent.ts
  const effectiveModelId = policy.modelId || 'gpt-4o';
  let effectiveProviderId = policy.providerId;
  if (!effectiveProviderId) {
    const modelInfo = findModel(effectiveModelId);
    effectiveProviderId = modelInfo?.providerId ||
      (effectiveModelId.includes('/') ? 'openrouter' :
       effectiveModelId.startsWith('claude-') ? 'anthropic' :
       effectiveModelId.startsWith('gemini-') ? 'google' : 'openai');
  }

  const isCodex = effectiveProviderId === 'codex';

  let summary: string;
  let usage: { prompt: number; completion: number };

  if (isCodex) {
    // Note: streamText supports maxOutputTokens via AI SDK, so we honor policy.maxOutputTokens
    // when the policy specifies it. This ensures consistent token limits across all paths.
    const stream = streamText({
      model,
      prompt,
      maxOutputTokens: policy.maxOutputTokens,
      providerOptions: {
        openai: {
          instructions: prompt,
          store: false,
        },
      },
    });
    summary = await stream.text;
    const resultUsage = await stream.usage;
    usage = {
      prompt: resultUsage.inputTokens ?? 0,
      completion: resultUsage.outputTokens ?? 0,
    };
  } else {
    try {
      const result = await generateText({
        model,
        prompt,
        maxOutputTokens: policy.maxOutputTokens,
      });
      summary = result.text;
      usage = {
        prompt: result.usage.inputTokens ?? 0,
        completion: result.usage.outputTokens ?? 0,
      };
    } catch (err) {
      console.error('[compaction] generateText failed:', err);
      if (err instanceof Error) {
        console.error('[compaction] error message:', err.message);
      }
      throw err;
    }
  }

  const now = Date.now();
  const msgId = randomUUID();

  // Create an assistant message with summary metadata
  // Record the effective model/provider that was actually used for generation
  const assistantMessage: AssistantMessage = {
    id: msgId,
    sessionId,
    role: 'assistant',
    status: 'completed',
    modelId: effectiveModelId,
    providerId: effectiveProviderId,
    tokens: {
      prompt: usage.prompt,
      completion: usage.completion,
    },
    cost: 0,
    summary: true,
    mode: 'compaction',
    parentId: triggerMessageId,
    createdAt: now,
    completedAt: now,
    partIds: [],
  };

  createMessage(assistantMessage);

  // Create a text part with the summary content
  const textPartId = randomUUID();
  const textPart: TextPart = {
    id: textPartId,
    messageId: msgId,
    createdAt: now,
    type: 'text',
    text: summary,
  };
  createPart(textPart, sessionId);

  // Mark tool results as compacted so they can be pruned in future context
  // WS4: Now passes policy for budget-aware pruning
  const compactedMessageIds = messagesToCompact.map((m) => m.message.id);
  markToolsAsCompacted(sessionId, compactedMessageIds, policy);

  const trigger: CompactionTrigger = {
    messageId: triggerMessageId,
    reason,
  };

  return {
    trigger,
    summaryMessage: assistantMessage,
    textParts: [textPart],
    tokensUsed: usage,
  };
}

/**
 * Persist a compaction failure as an append-only assistant message.
 * Creates an assistant message with status='error', mode='compact_failed',
 * parentId pointing to the trigger, and a text part with the error explanation.
 * Broadcasts the failure via standard message/part events.
 *
 * NOTE: This should only be called AFTER a trigger has been created.
 * If validation fails before trigger creation, do not call this function.
 */
export function persistCompactionFailure(
  sessionId: string,
  triggerMessageId: string,
  errorMessage: string,
): void {
  const now = Date.now();
  const msgId = randomUUID();

  const assistantMessage: AssistantMessage = {
    id: msgId,
    sessionId,
    role: 'assistant',
    status: 'error',
    modelId: '',
    providerId: '',
    tokens: {
      prompt: 0,
      completion: 0,
    },
    cost: 0,
    mode: 'compact_failed',
    parentId: triggerMessageId,
    createdAt: now,
    completedAt: now,
    error: errorMessage,
    partIds: [],
  };

  createMessage(assistantMessage);

  const textPartId = randomUUID();
  const textPart: TextPart = {
    id: textPartId,
    messageId: msgId,
    createdAt: now,
    type: 'text',
    text: `Compaction failed: ${errorMessage}`,
  };

  createPart(textPart, sessionId);

  broadcastEvent({ type: 'message.created', message: assistantMessage });
  broadcastEvent({ type: 'part.created', sessionId, part: textPart });
}
