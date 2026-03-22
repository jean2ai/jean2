import type { ProviderStatus } from '@jean2/shared';
import * as codex from './codex';

export async function getProviderStatus(provider: string): Promise<ProviderStatus> {
  switch (provider) {
    case 'codex': {
      const status = codex.getCodexStatus();
      return {
        provider: 'codex',
        connected: status.connected,
        connectedAt: status.connectedAt,
        accountId: status.accountId,
      };
    }
    default:
      return { provider: provider as 'codex', connected: false };
  }
}

export async function connectProvider(provider: string): Promise<{ authorizationUrl?: string }> {
  switch (provider) {
    case 'codex': {
      const result = await codex.startCodexConnect();
      return { authorizationUrl: result.authorizationUrl };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function disconnectProvider(provider: string): Promise<void> {
  switch (provider) {
    case 'codex':
      codex.disconnectCodex();
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export {
  getCodexConfig,
  createCodexFetch,
  OAUTH_DUMMY_KEY,
  setOAuthCompletionCallback,
  getCodexStatus,
} from './codex';
