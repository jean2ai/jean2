import { useEffect } from 'react';
import type { PendingAskRequest, AskHandler } from '@/stores/askStore';
import { useAskStore } from '@/stores/askStore';

const permissionHandler: AskHandler = (request: PendingAskRequest) => {
  if (request.ask.target !== 'permission') return undefined;

  // Only auto-approve low-risk permissions
  if (request.ask.risk === 'low') {
    return true;
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