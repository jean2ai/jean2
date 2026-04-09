import { useRef, useSyncExternalStore, useEffect } from 'react';
import { MessageStore } from '@jean2/sdk';
import type { MessageStoreOptions, Message, Part } from '@jean2/sdk';
import { useClientFromContext } from './use-internal-client';

interface MessageStoreSnapshot {
  sessionIds: string[];
}

export interface UseMessageStoreOptions extends MessageStoreOptions {
  enabled?: boolean;
}

export interface UseMessageStoreReturn extends MessageStoreSnapshot {
  manager: MessageStore | null;
  getForSession(sessionId: string): Message[] | undefined;
  getPart(partId: string): Part | undefined;
  isStreaming(sessionId: string): boolean;
}

export function useMessageStore(options?: UseMessageStoreOptions): UseMessageStoreReturn {
  const client = useClientFromContext();
  const enabled = options?.enabled !== false;
  const managerRef = useRef<MessageStore | null>(null);
  const clientRef = useRef(client);
  const versionRef = useRef(0);

  if (enabled && client && client !== clientRef.current && managerRef.current) {
    managerRef.current.dispose();
    managerRef.current = null;
  }

  if (enabled && client && !managerRef.current) {
    managerRef.current = new MessageStore(client, options);
  }

  clientRef.current = client ?? clientRef.current;
  const manager = managerRef.current;

  const subscribe = (onStoreChange: () => void): (() => void) => {
    if (!manager) return () => {};

    const handler = () => {
      versionRef.current++;
      onStoreChange();
    };

    manager.on('message:created', handler);
    manager.on('message:updated', handler);
    manager.on('message:appended', handler);
    manager.on('session:cleared', handler);
    manager.on('messages:replaced', handler);

    return () => {
      manager.off('message:created', handler);
      manager.off('message:updated', handler);
      manager.off('message:appended', handler);
      manager.off('session:cleared', handler);
      manager.off('messages:replaced', handler);
    };
  };

  useSyncExternalStore(subscribe, () => versionRef.current);

  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
      clientRef.current = null;
    };
  }, []);

  if (!manager) {
    return {
      sessionIds: [],
      manager: null,
      getForSession: (_sessionId: string) => undefined,
      getPart: (_partId: string) => undefined,
      isStreaming: (_sessionId: string) => false,
    };
  }

  return {
    sessionIds: manager.getStreamingSessions(),
    manager,
    getForSession: (sessionId: string) => manager.getForSession(sessionId),
    getPart: (partId: string) => manager.getPart(partId),
    isStreaming: (sessionId: string) => manager.isStreaming(sessionId),
  };
}
