import type { SessionHandlersContext } from './types';

export function handleProviderStatus(
  msg: { type: 'provider.status'; provider: string; connected: boolean; authorizationUrl?: string; error?: string },
  ctx: SessionHandlersContext,
): void {
  const { provider, connected, authorizationUrl, error } = msg;
  const { setProviderStatuses } = ctx;

  setProviderStatuses(prev => {
    const existing = prev.find(s => s.provider === provider);
    if (existing) {
      return prev.map(s => s.provider === provider
        ? { ...s, connected, authorizationUrl, error }
        : s
      );
    }
    return [...prev, { provider, connected, authorizationUrl, error }];
  });
}

export function handleProviderConnected(
  msg: { type: 'provider.connected'; provider: string; connected: boolean; connectedAt?: string; accountId?: string },
  ctx: SessionHandlersContext,
): void {
  const { provider, connected, connectedAt, accountId } = msg;
  const { setProviderStatuses } = ctx;

  setProviderStatuses(prev =>
    prev.map(s => s.provider === provider
      ? { ...s, connected, connectedAt, accountId }
      : s
    )
  );
}

export const providerHandlers = {
  'provider.status': handleProviderStatus,
  'provider.connected': handleProviderConnected,
} as const;
