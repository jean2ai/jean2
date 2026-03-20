import {
  listMessagesWithParts,
  deleteMessage,
  updateMessage,
} from '@/store';

interface RevertResult {
  revertedTo: {
    messageId: string;
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
}

export async function revertToStep(options: RevertOptions): Promise<RevertResult> {
  const { sessionId, targetMessageId } = options;

  const allMessages = listMessagesWithParts(sessionId);
  const targetIndex = allMessages.findIndex(m => m.message.id === targetMessageId);

  if (targetIndex === -1) {
    throw new Error('Target message not found');
  }

  const messagesToDelete = allMessages.slice(targetIndex + 1);

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

  return {
    revertedTo: {
      messageId: targetMessageId,
      messageCount: targetIndex,
    },
    removed: {
      messageIds: removedMessageIds,
      partCount: partCountRemoved,
    },
  };
}
