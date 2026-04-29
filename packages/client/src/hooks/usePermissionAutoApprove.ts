import { useEffect } from 'react';
import type { AskHandler } from '@/stores/askStore';
import type { AskPermissionResponse } from '@jean2/sdk';
import { useAskStore } from '@/stores/askStore';

const permissionHandler: AskHandler = (request) => {
  // Check if it's a permission ask (either with explicit target or canonical type)
  const ask = request.ask;
  const isPermissionAsk = ('target' in ask && ask.target === 'permission') || ask.type === 'permission';
  
  if (!isPermissionAsk) return undefined;

  // Only auto-approve low-risk permissions
  if ('risk' in ask && ask.risk === 'low') {
    return { type: 'permission', grant: 'session' } satisfies AskPermissionResponse;
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
