import type { StepPart } from '@jean2/shared';
import { 
  listMessagesWithParts, 
  deleteMessage,
  updateMessage,

} from '@/store';

// =============================================================================
// Types
// =============================================================================

interface ConversationSnapshot {
  version: 1;
  timestamp: number;
  sessionId: string;
  messages: {
    id: string;
    createdAt: number;
    role: string;
  }[];
}


interface RevertResult {
  revertedTo: {
    stepNumber: number;
    messageCount: number;
  };
  removed: {
    messageIds: string[];
    partCount: number;
  };
}

interface RevertOptions {
  sessionId: string;
  targetStepPartId: string;
}

// =============================================================================
// Snapshot Functions
// =============================================================================

export function createSnapshot(sessionId: string): string {
  const messagesWithParts = listMessagesWithParts(sessionId);

  const snapshot: ConversationSnapshot = {
    version: 1,
    timestamp: Date.now(),
    sessionId,
    messages: messagesWithParts.map(({ message }) => ({
      id: message.id,
      createdAt: message.createdAt,
      role: message.role,
    })),
  };

  return JSON.stringify(snapshot);
}

export function parseSnapshot(snapshotJson: string): ConversationSnapshot {
  return JSON.parse(snapshotJson) as ConversationSnapshot;
}

// =============================================================================
// Revert Function
// =============================================================================

export async function revertToStep(options: RevertOptions): Promise<RevertResult> {
  const { sessionId, targetStepPartId } = options;

  // ==========================================================================
  // 1. Find the target step part and get its snapshot
  // ==========================================================================
  const allMessages = listMessagesWithParts(sessionId);
  
  let targetStepPart: StepPart | null = null;
  let targetStepNumber: number = -1;

  for (const { parts } of allMessages) {
    for (const part of parts) {
      if (part.id === targetStepPartId && part.type === 'step') {
        targetStepPart = part as StepPart;
        targetStepNumber = (part as StepPart).number;
        break;
      }
    }
    if (targetStepPart) break;
  }

  if (!targetStepPart || !targetStepPart.snapshot) {
    throw new Error('Target step not found or has no snapshot');
  }

  const snapshot = parseSnapshot(targetStepPart.snapshot);

  // ==========================================================================
  // 2. Identify messages to keep vs remove
  // ==========================================================================
  const snapshotMessageIds = new Set(snapshot.messages.map(m => m.id));
  const currentMessageIds = new Set(allMessages.map(m => m.message.id));

  // Messages in current but not in snapshot = to be removed
  const messagesToRemove = allMessages
    .filter(m => !snapshotMessageIds.has(m.message.id))
    .map(m => m.message.id);

  // Messages in snapshot but not in current = missing (shouldn't happen)
  const missingMessages = [...snapshotMessageIds].filter(id => !currentMessageIds.has(id));
  if (missingMessages.length > 0) {
    console.warn('Snapshot contains messages not in current state:', missingMessages);
  }

  // ==========================================================================
  // 3. Delete messages that came after the snapshot
  // ==========================================================================
  let partCountRemoved = 0;
  
  for (const messageId of messagesToRemove) {
    const messageWithParts = allMessages.find(m => m.message.id === messageId);
    if (messageWithParts) {
      partCountRemoved += messageWithParts.parts.length;
    }
    deleteMessage(messageId);  // Cascades to parts
  }

  // ==========================================================================
  // 4. Update any assistant messages that were "streaming" to "error"
  // ==========================================================================
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
      stepNumber: targetStepNumber,
      messageCount: snapshot.messages.length,
    },
    removed: {
      messageIds: messagesToRemove,
      partCount: partCountRemoved,
    },
  };
}
