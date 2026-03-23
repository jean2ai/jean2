export type ProviderType = string;

export type AuthType = 'api_key' | 'oauth' | 'none';

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  description?: string;
  authType: AuthType;
  connectable: boolean;
}

export interface ProviderStatus {
  provider: string;
  connected: boolean;
  authorizationUrl?: string;
  error?: string;
  connectedAt?: string;
  accountId?: string;
  displayName?: string;
  description?: string;
  authType?: AuthType;
  connectable?: boolean;
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
