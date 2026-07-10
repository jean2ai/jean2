import type { ServerWebSocket } from 'bun';
import type { RouterContext } from '../router-context';
import * as providerManager from '@/providers';
import type { ProviderConnectMessage, ProviderDisconnectMessage } from '@jean2/sdk';

export async function handleProviderConnect(
  ctx: RouterContext,
  _ws: ServerWebSocket,
  msg: ProviderConnectMessage,
): Promise<void> {
  try {
    const result = await providerManager.connectProvider(msg.provider, {
      redirectStrategy: msg.redirectStrategy as 'client_redirect' | 'manual_paste' | 'server_callback' | undefined,
    });
    const status = await providerManager.getProviderStatus(msg.provider);
    ctx.broadcast({
      type: 'provider.status',
      provider: msg.provider,
      connected: status.connected,
      authorizationUrl: result.authorizationUrl,
      flowId: result.flowId,
      redirectStrategy: result.redirectStrategy,
      redirectUri: result.redirectUri,
    });

    const provider = providerManager.getProvider(msg.provider);
    if (provider?.onConnectComplete) {
      provider.onConnectComplete((success, error) => {
        if (success) {
          const newStatus = providerManager.getProviderStatus(msg.provider);
          ctx.broadcast({
            type: 'provider.connected',
            provider: msg.provider,
            connected: true,
            connectedAt: newStatus.connectedAt,
            accountId: newStatus.accountId,
          });
        } else {
          ctx.broadcast({
            type: 'provider.status',
            provider: msg.provider,
            connected: false,
            error: error || 'Connection flow failed',
          });
        }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect provider';
    ctx.broadcast({
      type: 'provider.status',
      provider: msg.provider,
      connected: false,
      error: message,
    });
  }
}

export async function handleProviderDisconnect(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: ProviderDisconnectMessage,
): Promise<void> {
  try {
    await providerManager.disconnectProvider(msg.provider);
    ctx.broadcast({
      type: 'provider.connected',
      provider: msg.provider,
      connected: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect provider';
    ctx.send(ws, { type: 'error', code: 'provider_error', message });
  }
}
