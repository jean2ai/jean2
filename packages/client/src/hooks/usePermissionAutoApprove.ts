import { useEffect } from 'react';
import type { PendingAskRequest, AskHandler } from '@/stores/askStore';
import { useAskStore } from '@/stores/askStore';
import { usePermissionStore } from '@/stores/permissionStore';

const permissionHandler: AskHandler = (request: PendingAskRequest) => {
  if (request.ask.target !== 'permission') return undefined;

  const ask = request.ask;

  // Only auto-approve low-risk permissions
  if (ask.risk === 'low') {
    return true;
  }

  // For medium risk, check if user has already approved this exact permission
  if (ask.risk === 'medium' || !ask.risk) {
    const { pendingPermissions } = usePermissionStore.getState();
    const matchingPermission = pendingPermissions.find(
      (p) => p.toolCallId === request.toolCallId,
    );

    // If there's already a pending permission request for this, don't auto-resolve
    // The existing permission flow will handle it
    if (matchingPermission) {
      return undefined;
    }
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