import { broadcastEvent } from './broadcast';
import { broadcastSessionUpdated } from './broadcast';
import {
  getSession,
  updateSession,
  listMessagesWithParts,
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
 * Executes a compaction cycle for a session.
 *
 * Encapsulates:
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
): Promise<CompactionExecutorResult | CompactionExecutorError> {
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

  updateSession(sessionId, { compacting: true });
  broadcastSessionUpdated(getSession(sessionId)!);

  try {
    const trigger = createCompactionTrigger(sessionId, reason);
    triggerMessageId = trigger.messageId;

    const allMessages = listMessagesWithParts(sessionId);
    const triggerMsg = allMessages.find(m => m.message.id === trigger.messageId);
    if (triggerMsg) {
      broadcastEvent({ type: 'message.created', message: triggerMsg.message });
      for (const part of triggerMsg.parts) {
        broadcastEvent({ type: 'part.created', sessionId, part });
      }
    }

    const result = await processCompactionTask(sessionId, trigger.messageId, policy);

    broadcastEvent({ type: 'message.created', message: result.summaryMessage });
    for (const part of result.textParts) {
      broadcastEvent({ type: 'part.created', sessionId, part });
    }

    const currentSession = getSession(sessionId);
    if (currentSession) {
      updateSession(sessionId, {
        promptTokens: result.tokensUsed.prompt,
        completionTokens: result.tokensUsed.completion,
        totalTokens: result.tokensUsed.prompt + result.tokensUsed.completion,
        compacting: false,
      });
      broadcastSessionUpdated(getSession(sessionId)!);
    }

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
    updateSession(sessionId, { compacting: false });
    const updatedSession = getSession(sessionId);
    if (updatedSession) broadcastSessionUpdated(updatedSession);
    const errorMessage = err instanceof Error ? err.message : 'Compaction failed';

    if (triggerMessageId) {
      persistCompactionFailure(sessionId, triggerMessageId, errorMessage);
    }

    return {
      ok: false,
      error: errorMessage,
      triggerMessageId,
      reason,
      skipped: false,
    };
  }
}
