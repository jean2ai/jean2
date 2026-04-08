import { useCallback, useEffect, useRef } from 'react';
import type { AttachmentKind, Jean2Client } from '@jean2/sdk';
import { useJean2Client } from './use-client';
import { useMessageStore } from './use-message-store';

export interface UseChatOptions {
  onError?: (error: unknown) => void;
}

export interface UseChatReturn {
  send: (content: string, attachments?: ChatAttachment[]) => void;
  isStreaming: boolean;
  interrupt: () => void;
}

export type ChatAttachment = {
  id: string;
  kind: AttachmentKind;
};

export function useChat(sessionId: string, options?: UseChatOptions): UseChatReturn {
  const client = useJean2Client();
  const { isStreaming } = useMessageStore();
  const clientRef = useRef<Jean2Client>(client);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const send = useCallback((content: string, attachments?: ChatAttachment[]) => {
    try {
      clientRef.current.chat.send(sessionId, content, { attachments });
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [sessionId]);

  const interrupt = useCallback(() => {
    try {
      clientRef.current.sessions.interrupt(sessionId);
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [sessionId]);

  return {
    send,
    isStreaming: isStreaming(sessionId),
    interrupt,
  };
}
