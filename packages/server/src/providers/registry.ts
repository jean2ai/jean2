import type { LanguageModel } from 'ai';
import type { ProviderDescriptor, ProviderStatus } from '@jean2/shared';

export interface ModelFactoryOptions {
  modelId: string;
  providerId: string;
  systemPrompt: string;
}

export interface ModelFactoryResult {
  model: LanguageModel;
  useProviderInstructions?: boolean;
  omitMaxOutputTokens?: boolean;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface ConnectableProvider {
  descriptor: ProviderDescriptor;

  getStatus(): ProviderStatus;

  connect(): Promise<{ authorizationUrl?: string }>;

  disconnect(): Promise<void>;

  createModel(options: ModelFactoryOptions): Promise<ModelFactoryResult>;

  onConnectComplete?: (callback: (success: boolean, error?: string) => void) => void;
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

export async function connectProvider(id: string): Promise<{ authorizationUrl?: string }> {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown connectable provider: ${id}`);
  }
  return provider.connect();
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
  return provider.createModel(options);
}
