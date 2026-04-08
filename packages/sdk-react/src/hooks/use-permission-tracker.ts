import { useRef, useSyncExternalStore, useEffect } from 'react';
import { PermissionTracker } from '@jean2/sdk';
import type { ToolPermission, QueuedMessage } from '@jean2/sdk';
import type { PendingPermissionRequest } from '@jean2/sdk';
import { useClientFromContext } from './use-internal-client';

interface PermissionTrackerSnapshot {
  pendingRequests: PendingPermissionRequest[];
  hasPending: boolean;
}

export interface UsePermissionTrackerOptions {
  enabled?: boolean;
}

export interface UsePermissionTrackerReturn extends PermissionTrackerSnapshot {
  manager: PermissionTracker;
  getPermissions(workspaceId: string): ToolPermission[];
  getQueue(sessionId: string): QueuedMessage[];
}

export function usePermissionTracker(options?: UsePermissionTrackerOptions): UsePermissionTrackerReturn {
  const client = useClientFromContext();
  const enabled = options?.enabled !== false;
  const managerRef = useRef<PermissionTracker | null>(null);
  const versionRef = useRef(0);

  if (enabled && !managerRef.current) {
    managerRef.current = new PermissionTracker(client);
  }

  const manager = managerRef.current;

  const subscribe = (onStoreChange: () => void): (() => void) => {
    if (!manager) return () => {};

    const handler = () => {
      versionRef.current++;
      onStoreChange();
    };

    manager.on('permission:pending', handler);
    manager.on('permission:resolved', handler);
    manager.on('permission:list.updated', handler);
    manager.on('queue:updated', handler);

    return () => {
      manager.off('permission:pending', handler);
      manager.off('permission:resolved', handler);
      manager.off('permission:list.updated', handler);
      manager.off('queue:updated', handler);
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
      pendingRequests: [],
      hasPending: false,
      manager: manager!,
      getPermissions: (_workspaceId: string) => [],
      getQueue: (_sessionId: string) => [],
    };
  }

  return {
    pendingRequests: manager.getPendingRequests(),
    hasPending: manager.hasPending(),
    manager,
    getPermissions: (workspaceId: string) => manager.getPermissions(workspaceId),
    getQueue: (sessionId: string) => manager.getQueue(sessionId),
  };
}
