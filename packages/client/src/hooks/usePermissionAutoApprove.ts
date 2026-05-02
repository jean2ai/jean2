import { useEffect } from 'react';
import type { AskHandler } from '@/stores/askStore';
import type { AskPermissionResponse, GrantScope } from '@jean2/sdk';
import { useAskStore } from '@/stores/askStore';

const permissionHandler: AskHandler = (request) => {
  const ask = request.ask;
  const isPermissionAsk = ('target' in ask && ask.target === 'permission') || ask.type === 'permission';

  if (!isPermissionAsk) return undefined;

  // Only auto-approve low-risk permissions
  if (!('risk' in ask) || ask.risk !== 'low') {
    return undefined;
  }

  // Respect the allowed scopes from server policy
  const allowedScopes = 'allowedScopes' in ask
    ? (ask.allowedScopes as GrantScope[]) ?? ['once', 'session', 'workspace']
    : ['once', 'session', 'workspace'];

  // Use 'session' if allowed, otherwise 'once' — never auto-approve 'workspace' scope
  const autoScope = allowedScopes.includes('session') ? 'session' : 'once';

  return { type: 'permission', grant: autoScope } satisfies AskPermissionResponse;
};

export function usePermissionAutoApprove(): void {
  useEffect(() => {
    useAskStore.getState().registerHandler('permission', permissionHandler);
    return () => {
      useAskStore.getState().unregisterHandler('permission', permissionHandler);
    };
  }, []);
}
