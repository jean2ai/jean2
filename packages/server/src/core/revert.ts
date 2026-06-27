import {
  listMessagesWithParts,
  deleteMessage,
  updateMessage,
} from '@/store';

interface RevertResult {
  revertedTo: {
    messageId: string | null;
    messageCount: number;
  };
  removed: {
    messageIds: string[];
    partCount: number;
  };
}

interface RevertOptions {
  sessionId: string;
  targetMessageId: string;
  /** When true, always keep the target message (delete only messages after it). */
  keepTarget?: boolean;
}

export async function revertToStep(options: RevertOptions): Promise<RevertResult> {
  const { sessionId, targetMessageId, keepTarget = false } = options;

  const allMessages = listMessagesWithParts(sessionId);
  const targetIndex = allMessages.findIndex(m => m.message.id === targetMessageId);

  if (targetIndex === -1) {
    throw new Error('Target message not found');
  }

  let messagesToDelete: typeof allMessages;

  if (targetIndex === 0 && !keepTarget) {
    // Clear all: delete everything including the target message
    messagesToDelete = allMessages;
  } else {
    // Normal revert: keep target, delete everything after
    messagesToDelete = allMessages.slice(targetIndex + 1);
  }

  const removedMessageIds: string[] = [];
  let partCountRemoved = 0;

  for (const { message, parts } of messagesToDelete) {
    partCountRemoved += parts.length;
    removedMessageIds.push(message.id);
    deleteMessage(message.id);
  }

  const remainingMessages = listMessagesWithParts(sessionId);
  for (const { message } of remainingMessages) {
    if (message.role === 'assistant' && message.status === 'streaming') {
      updateMessage(message.id, {
        status: 'error',
        error: 'Reverted before completion',
      });
    }
  }

  const clearedAll = targetIndex === 0 && !keepTarget;

  return {
    revertedTo: {
      messageId: clearedAll ? null : targetMessageId,
      messageCount: clearedAll ? 0 : targetIndex,
    },
    removed: {
      messageIds: removedMessageIds,
      partCount: partCountRemoved,
    },
  };
}
