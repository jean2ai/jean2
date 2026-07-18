import type { LanguageModel } from 'ai';
import type { ProviderDescriptor, ProviderStatus, OAuthRedirectStrategy } from '@jean2/sdk';

export interface ModelFactoryOptions {
  modelId: string;
  providerId: string;
  systemPrompt: string;
  sessionId?: string;
}

export interface ModelFactoryResult {
  model: LanguageModel;
  useProviderInstructions?: boolean;
  omitMaxOutputTokens?: boolean;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface ConnectOptions {
  /** The redirect strategy the client prefers. */
  redirectStrategy?: OAuthRedirectStrategy;
}

export interface ConnectResult {
  authorizationUrl?: string;
  flowId?: string;
  redirectStrategy?: OAuthRedirectStrategy;
  redirectUri?: string;
}

export interface ConnectableProvider {
  descriptor: ProviderDescriptor;

  getStatus(): ProviderStatus;

  connect(options?: ConnectOptions): Promise<ConnectResult>;

  disconnect(): Promise<void>;

  /**
   * Called by the OAuth manager when tokens are successfully exchanged.
   * The provider should save tokens and return provider-specific status.
   */
  onTokensReceived(tokens: TokenResponse): Promise<void>;

  /**
   * Creates an LLM model instance from the stored OAuth credentials.
   * Only required for LLM providers (kind: 'llm'). Service providers can omit this.
   */
  createModel?(options: ModelFactoryOptions): Promise<ModelFactoryResult>;
}

/** Standard OAuth 2.0 token response. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
}

const providers = new Map<string, ConnectableProvider>();

export function registerProvider(provider: ConnectableProvider): void {
  providers.set(provider.descriptor.id, provider);
}

export function getConnectableProviders(): ConnectableProvider[] {
  return Array.from(providers.values());
}

export function getProvider(id: string): ConnectableProvider | undefined {
  return providers.get(id);
}

export function getProviderStatus(id: string): ProviderStatus {
  const provider = providers.get(id);
  if (!provider) {
    return { provider: id, connected: false };
  }
  return provider.getStatus();
}

export async function connectProvider(id: string, options?: ConnectOptions): Promise<ConnectResult> {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown connectable provider: ${id}`);
  }
  return provider.connect(options);
}

export async function disconnectProvider(id: string): Promise<void> {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown connectable provider: ${id}`);
  }
  return provider.disconnect();
}

export async function createModelForProvider(options: ModelFactoryOptions): Promise<ModelFactoryResult> {
  const provider = providers.get(options.providerId);
  if (!provider) {
    throw new Error(`Unknown connectable provider: ${options.providerId}`);
  }
  if (!provider.createModel) {
    throw new Error(`Provider '${options.providerId}' does not support creating models (kind: 'service')`);
  }
  return provider.createModel(options);
}
