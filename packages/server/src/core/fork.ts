import type { Session, Message, Part, MessageWithParts } from '@jean2/shared';
import {
  listMessagesWithParts,
  createSession,
  createMessage,
  createPart,
  getSession,
} from '@/store';

interface ForkOptions {
  sessionId: string;
  targetMessageId: string;
  title?: string;
}

interface ForkResult {
  forkedSession: Session;
  messages: MessageWithParts[];
}

function generateId(): string {
  return crypto.randomUUID();
}

function copyMessage(message: Message, newSessionId: string, newMessageId: string): Message {
  if (message.role === 'assistant') {
    return {
      ...message,
      id: newMessageId,
      sessionId: newSessionId,
      status: 'completed' as const,
    };
  }
  return {
    ...message,
    id: newMessageId,
    sessionId: newSessionId,
  };
}

function copyPart(part: Part, newMessageId: string, newSessionId: string, newPartId: string): Part {
  const { id: _oldId, messageId: _oldMsgId, ...rest } = part;
  return {
    ...rest,
    id: newPartId,
    messageId: newMessageId,
  } as Part;
}

export async function forkSession(options: ForkOptions): Promise<ForkResult> {
  const { sessionId, targetMessageId, title } = options;

  const sourceSession = getSession(sessionId);
  if (!sourceSession) {
    throw new Error('Source session not found');
  }

  const allMessages = listMessagesWithParts(sessionId);
  const targetIndex = allMessages.findIndex(m => m.message.id === targetMessageId);

  if (targetIndex === -1) {
    throw new Error('Target message not found');
  }

  const messagesToFork = allMessages.slice(0, targetIndex + 1);

  const forkTitle = title || `${sourceSession.title || 'Untitled'} (fork)`;

  const forkedSession = createSession({
    id: generateId(),
    workspaceId: sourceSession.workspaceId,
    preconfigId: sourceSession.preconfigId,
    title: forkTitle,
    status: 'active',
    metadata: {
      ...(sourceSession.metadata || {}),
      forkedFrom: sessionId,
    },
    parentId: null,
    agentName: null,
    selectedModel: sourceSession.selectedModel,
    selectedProvider: sourceSession.selectedProvider,
    promptTokens: sourceSession.promptTokens,
    completionTokens: sourceSession.completionTokens,
    totalTokens: sourceSession.totalTokens,
  });

  const forkedMessages: MessageWithParts[] = [];

  for (const { message, parts } of messagesToFork) {
    const newMessageId = generateId();
    const newMessage = copyMessage(message, forkedSession.id, newMessageId);
    createMessage(newMessage);

    const newParts: Part[] = [];
    for (const part of parts) {
      const newPartId = generateId();
      const newPart = copyPart(part, newMessageId, forkedSession.id, newPartId);
      createPart(newPart, forkedSession.id);
      newParts.push(newPart);
    }

    forkedMessages.push({ message: newMessage, parts: newParts });
  }

  return {
    forkedSession,
    messages: forkedMessages,
  };
}
