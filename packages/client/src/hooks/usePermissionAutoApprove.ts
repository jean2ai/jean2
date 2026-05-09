import { useEffect } from 'react';
import type { AskHandler } from '@/stores/askStore';
import type { AskPermissionResponse, GrantScope, PermissionRiskLevel } from '@jean2/sdk';
import { useAskStore } from '@/stores/askStore';
import { useUIStore } from '@/stores/uiStore';

const RISK_ORDER: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

function isAtOrBelow(risk: PermissionRiskLevel, max: PermissionRiskLevel): boolean {
  return RISK_ORDER.indexOf(risk) <= RISK_ORDER.indexOf(max);
}

function createPermissionHandler(): AskHandler {
  return (request) => {
    const ask = request.ask;
    const isPermissionAsk = ('target' in ask && ask.target === 'permission') || ask.type === 'permission';

    if (!isPermissionAsk) return undefined;

    // Check the per-session auto-approve severity setting
    const maxSeverity = useUIStore.getState().getAutoApproveMaxSeverity(request.sessionId);

    // If no per-session setting, auto-approve 'low' by default (backward compatible)
    // If explicitly 'off', skip auto-approve entirely
    if (maxSeverity === 'off') return undefined;
    const effectiveMax = maxSeverity ?? 'low';

    // Check risk level
    const risk = ('risk' in ask ? ask.risk : undefined) as PermissionRiskLevel | undefined;
    if (!risk || !isAtOrBelow(risk, effectiveMax)) {
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
}

export function usePermissionAutoApprove(): void {
  useEffect(() => {
    const handler = createPermissionHandler();
    useAskStore.getState().registerHandler('permission', handler);
    return () => {
      useAskStore.getState().unregisterHandler('permission', handler);
    };
  }, []);
}
