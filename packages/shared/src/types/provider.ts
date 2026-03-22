export type ProviderType = 'codex';

export interface ProviderStatus {
  provider: string;
  connected: boolean;
  authorizationUrl?: string;
  error?: string;
  connectedAt?: string;
  accountId?: string;
}

export interface CodexProviderConfig {
  type: 'oauth';
  provider: 'codex';
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  connectedAt: string;
}
