import { findModel } from '@/config';
import {
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
  getLLMDeepseekApiKey,
} from '@/env';
import { getModelsConfig } from '@/config';
import type { Session, Preconfig } from '@jean2/sdk';

export type Provider = 'openai' | 'anthropic' | 'openrouter' | 'google' | 'minimax' | 'zhipu' | 'zhipu-coding' | 'deepseek';

const PROVIDER_PREFIXES: Array<{ test: (m: string) => boolean; provider: string }> = [
  { test: (m) => m.includes('/'), provider: 'openrouter' },
  { test: (m) => m.startsWith('claude-'), provider: 'anthropic' },
  { test: (m) => m.startsWith('gemini-'), provider: 'google' },
  { test: (m) => m.startsWith('MiniMax-') || m.toLowerCase().includes('minimax'), provider: 'minimax' },
  { test: (m) => m.startsWith('deepseek-'), provider: 'deepseek' },
];

export function findProviderFromModel(modelId: string): string {
  const modelInfo = findModel(modelId);
  if (modelInfo) return modelInfo.providerId;

  for (const { test, provider } of PROVIDER_PREFIXES) {
    if (test(modelId)) return provider;
  }
  return 'openai';
}

const apiKeyGetterMap: Record<string, () => string | undefined> = {
  openai: getLLMOpenAIApiKey,
  anthropic: getLLMAnthropicApiKey,
  openrouter: getLLMOpenRouterApiKey,
  google: getLLMGoogleApiKey,
  minimax: getLLMMinimaxApiKey,
  zhipu: getLLMZhipuApiKey,
  'zhipu-coding': getLLMZhipuCodingApiKey,
  deepseek: getLLMDeepseekApiKey,
};

export function getApiKeyForProvider(provider: string): string | undefined {
  const getter = apiKeyGetterMap[provider];
  return getter ? getter() : undefined;
}

export function resolveModelId(
  session: Pick<Session, 'selectedModel'> | null,
  preconfig: Pick<Preconfig, 'model'> | null | undefined,
): string {
  return session?.selectedModel || preconfig?.model || getModelsConfig().defaultModel;
}

export function resolveProviderId(
  session: Pick<Session, 'selectedProvider'> | null,
  preconfig: Pick<Preconfig, 'model'> | null | undefined,
): string {
  return (
    session?.selectedProvider ||
    (preconfig?.model ? findProviderFromModel(preconfig.model) : null) ||
    getModelsConfig().defaultProvider
  );
}
