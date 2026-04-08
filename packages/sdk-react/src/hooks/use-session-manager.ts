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
  manager: SessionManager;
}

export function useSessionManager(options?: UseSessionManagerOptions): UseSessionManagerReturn {
  const client = useClientFromContext();
  const enabled = options?.enabled !== false;
  const managerRef = useRef<SessionManager | null>(null);
  const versionRef = useRef(0);

  if (enabled && !managerRef.current) {
    managerRef.current = new SessionManager(client, options);
  }

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
      manager?.dispose();
    };
  }, []);

  if (!manager) {
    return {
      sessions: [],
      active: null,
      manager: manager!,
    };
  }

  return {
    sessions: manager.list(),
    active: manager.active,
    manager,
  };
}
