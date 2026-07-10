import { broadcastEvent, broadcastSessionUpdated, type BroadcastFn, type BroadcastSessionFn } from './broadcast';
import {
  getSession,
  updateSession,
  getMessageWithParts,
} from '@/store';
import {
  createCompactionTrigger,
  processCompactionTask,
  persistCompactionFailure,
  resolveCompactionPolicy,
  type CompactionTriggerReason,
} from './compaction';
import { getModelsConfig } from '@/config';

/**
 * Result of a compaction execution attempt.
 */
export interface CompactionExecutorResult {
  ok: true;
  result: {
    tokensUsed: {
      prompt: number;
      completion: number;
    };
    summaryMessageId: string;
    textParts: Array<{ id: string; messageId: string; createdAt: number; type: string; text: string }>;
  };
  triggerMessageId: string;
  reason: CompactionTriggerReason;
}

export interface CompactionExecutorError {
  ok: false;
  error: string;
  triggerMessageId: string | null;
  reason: CompactionTriggerReason;
  skipped: boolean;
}

/**
 * In-memory set of session IDs currently running a compaction.
 * This is the authoritative source of truth for "is compaction actually in-flight?"
 * and is used to prevent:
 *  - Double compaction (manual trigger while auto/overflow is running)
 *  - False reconciliation (session resume clearing a genuinely running compaction)
 */
const activeCompactionSessions = new Set<string>();

/**
 * Returns true if a compaction is currently in-flight for the given session.
 */
export function isCompactionActive(sessionId: string): boolean {
  return activeCompactionSessions.has(sessionId);
}

/**
 * Executes a compaction cycle for a session.
 *
 * Encapsulates:
 * - double-compaction guard (in-memory set)
 * - main-session guard
 * - session.compacting true/false transitions
 * - policy resolution (using existing resolveCompactionPolicy)
 * - trigger creation and broadcasting
 * - processing via processCompactionTask
 * - failure persistence via persistCompactionFailure
 * - session token update from compaction result
 * - standard trigger/summary broadcasting
 */
export async function executeCompaction(
  sessionId: string,
  reason: CompactionTriggerReason,
  broadcast: BroadcastFn = broadcastEvent,
  broadcastSessUpdate: BroadcastSessionFn = broadcastSessionUpdated,
): Promise<CompactionExecutorResult | CompactionExecutorError> {
  // Guard: prevent double compaction
  if (activeCompactionSessions.has(sessionId)) {
    return {
      ok: false,
      error: 'Compaction is already in progress for this session',
      triggerMessageId: null,
      reason,
      skipped: true,
    };
  }

  let triggerMessageId: string | null = null;

  const session = getSession(sessionId);
  if (!session || session.parentId) {
    return {
      ok: false,
      error: 'Compaction is only available for main sessions',
      triggerMessageId: null,
      reason,
      skipped: true,
    };
  }

  const config = getModelsConfig();
  const sessionModelId = session.selectedModel || config.defaultModel;
  const sessionProviderId = session.selectedProvider || config.defaultProvider;

  const policy = resolveCompactionPolicy(sessionModelId, sessionProviderId);

  activeCompactionSessions.add(sessionId);
  const compactingSession = updateSession(sessionId, { compacting: true });
  if (compactingSession) broadcastSessUpdate(compactingSession);

  try {
    const trigger = createCompactionTrigger(sessionId, reason);
    triggerMessageId = trigger.messageId;

    const triggerMsg = getMessageWithParts(trigger.messageId);
    if (triggerMsg) {
      broadcast({ type: 'message.created', message: triggerMsg.message });
      for (const part of triggerMsg.parts) {
        broadcast({ type: 'part.created', sessionId, part });
      }
    }

    const result = await processCompactionTask(sessionId, trigger.messageId, policy);

    broadcast({ type: 'message.created', message: result.summaryMessage });
    for (const part of result.textParts) {
      broadcast({ type: 'part.created', sessionId, part });
    }

    const completedSession = updateSession(sessionId, {
      promptTokens: result.tokensUsed.prompt,
      completionTokens: result.tokensUsed.completion,
      totalTokens: result.tokensUsed.prompt + result.tokensUsed.completion,
      compacting: false,
    });
    if (completedSession) broadcastSessUpdate(completedSession);

    return {
      ok: true,
      result: {
        tokensUsed: result.tokensUsed,
        summaryMessageId: result.summaryMessage.id,
        textParts: result.textParts,
      },
      triggerMessageId,
      reason,
    };
  } catch (err: unknown) {
    const updatedSession = updateSession(sessionId, { compacting: false });
    if (updatedSession) broadcastSessUpdate(updatedSession);
    const errorMessage = err instanceof Error ? err.message : 'Compaction failed';

    if (triggerMessageId) {
      persistCompactionFailure(sessionId, triggerMessageId, errorMessage, broadcast);
    }

    return {
      ok: false,
      error: errorMessage,
      triggerMessageId,
      reason,
      skipped: false,
    };
  } finally {
    activeCompactionSessions.delete(sessionId);
  }
}
