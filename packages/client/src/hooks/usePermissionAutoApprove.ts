import { useEffect } from 'react';
import type { AskHandler } from '@/stores/askStore';
import type { AskPermissionResponse } from '@jean2/sdk';
import { useAskStore } from '@/stores/askStore';

const permissionHandler: AskHandler = (request) => {
  if (request.ask.target !== 'permission') return undefined;

  // Only auto-approve low-risk permissions
  if (request.ask.risk === 'low') {
    return { type: 'permission', allowed: true } satisfies AskPermissionResponse;
  }

  // Fall through to user UI
  return undefined;
};

export function usePermissionAutoApprove(): void {
  useEffect(() => {
    useAskStore.getState().registerHandler('permission', permissionHandler);
    return () => {
      useAskStore.getState().unregisterHandler('permission', permissionHandler);
    };
  }, []);
}
