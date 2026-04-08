import type { Message } from '@jean2/sdk';
import { useMessageStore } from './use-message-store';

export interface UseMessagesReturn {
  messages: Message[];
  isStreaming: boolean;
}

export function useMessages(sessionId: string): UseMessagesReturn {
  const { getForSession, isStreaming } = useMessageStore();

  return {
    messages: getForSession(sessionId) ?? [],
    isStreaming: isStreaming(sessionId),
  };
}
