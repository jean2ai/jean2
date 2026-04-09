import { useCallback, useEffect, useRef } from 'react';
import type { Jean2Client } from '@jean2/sdk';
import { useJean2Client } from './use-client';

export interface UseChatOptions {
  onError?: (error: unknown) => void;
  isStreaming?: boolean;
}

export interface UseChatReturn {
  send: (content: string, attachments?: ChatAttachment[]) => void;
  isStreaming: boolean;
  interrupt: () => void;
}

export type ChatAttachment = {
  id: string;
  kind: import('@jean2/sdk').AttachmentKind;
};

export function useChat(sessionId: string, options?: UseChatOptions): UseChatReturn {
  const client = useJean2Client();
  const clientRef = useRef<Jean2Client | null>(client);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const send = useCallback((content: string, attachments?: ChatAttachment[]) => {
    try {
      clientRef.current?.chat.send(sessionId, content, { attachments });
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [sessionId]);

  const interrupt = useCallback(() => {
    try {
      clientRef.current?.sessions.interrupt(sessionId);
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [sessionId]);

  return {
    send,
    isStreaming: options?.isStreaming ?? false,
    interrupt,
  };
}
