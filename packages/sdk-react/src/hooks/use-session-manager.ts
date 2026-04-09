import { useRef, useSyncExternalStore, useEffect } from 'react';
import { SessionManager } from '@jean2/sdk';
import type { SessionManagerOptions, Session } from '@jean2/sdk';
import { useClientFromContext } from './use-internal-client';

interface SessionManagerSnapshot {
  sessions: Session[];
  active: Session | null;
}

export interface UseSessionManagerOptions extends SessionManagerOptions {
  enabled?: boolean;
}

export interface UseSessionManagerReturn extends SessionManagerSnapshot {
  manager: SessionManager | null;
  version: number;
}

export function useSessionManager(options?: UseSessionManagerOptions): UseSessionManagerReturn {
  const client = useClientFromContext();
  const enabled = options?.enabled !== false;
  const managerRef = useRef<SessionManager | null>(null);
  const clientRef = useRef(client);
  const versionRef = useRef(0);

  if (enabled && client && client !== clientRef.current && managerRef.current) {
    managerRef.current.dispose();
    managerRef.current = null;
  }

  if (enabled && client && !managerRef.current) {
    managerRef.current = new SessionManager(client, options);
  }

  clientRef.current = client ?? clientRef.current;
  const manager = managerRef.current;

  const subscribe = (onStoreChange: () => void): (() => void) => {
    if (!manager) return () => {};

    const handler = () => {
      versionRef.current++;
      onStoreChange();
    };

    manager.on('session:created', handler);
    manager.on('session:updated', handler);
    manager.on('session:removed', handler);
    manager.on('session:active', handler);

    return () => {
      manager.off('session:created', handler);
      manager.off('session:updated', handler);
      manager.off('session:removed', handler);
      manager.off('session:active', handler);
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
      sessions: [],
      active: null,
      manager: null,
      version: 0,
    };
  }

  return {
    sessions: manager.list(),
    active: manager.active,
    manager,
    version: manager.version,
  };
}
