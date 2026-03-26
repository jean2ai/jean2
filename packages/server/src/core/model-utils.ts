import { type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { findModel } from '@/config';
import {
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
  getLLMBaseUrl,
} from '../env';
import { getProvider, createModelForProvider } from '@/providers';

export interface ModelWithMetadata {
  model: LanguageModel;
  useProviderInstructions?: boolean;
  omitMaxOutputTokens?: boolean;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export async function getModelWithMetadata(modelId?: string, providerId?: string, systemPrompt?: string): Promise<ModelWithMetadata> {
  const defaultModelId = 'gpt-4o';
  const resolvedModelId = modelId || defaultModelId;

  let provider = providerId;
  let model = resolvedModelId;

  if (!provider) {
    const modelInfo = findModel(resolvedModelId);

    if (modelInfo) {
      provider = modelInfo.providerId;
      model = modelInfo.id;
    } else {
      if (resolvedModelId.includes('/')) {
        provider = 'openrouter';
      } else if (resolvedModelId.startsWith('claude-')) {
        provider = 'anthropic';
      } else if (resolvedModelId.startsWith('gemini-')) {
        provider = 'google';
      } else {
        provider = 'openai';
      }
    }
  }

  const registeredProvider = provider ? getProvider(provider) : undefined;
  if (registeredProvider) {
    const result = await createModelForProvider({
      modelId: model,
      providerId: provider,
      systemPrompt: systemPrompt || '',
    });
    return {
      model: result.model,
      useProviderInstructions: result.useProviderInstructions,
      omitMaxOutputTokens: result.omitMaxOutputTokens,
      providerOptions: result.providerOptions,
    };
  }

  const getApiKey = () => {
    switch (provider) {
      case 'openai':
        return getLLMOpenAIApiKey();
      case 'anthropic':
        return getLLMAnthropicApiKey();
      case 'openrouter':
        return getLLMOpenRouterApiKey();
      case 'google':
        return getLLMGoogleApiKey();
      case 'minimax':
        return getLLMMinimaxApiKey();
      case 'zhipu':
        return getLLMZhipuApiKey();
      case 'zhipu-coding':
        return getLLMZhipuCodingApiKey();
      default:
        return getLLMOpenAIApiKey();
    }
  };

  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}. Set LLM_${provider.toUpperCase()}_API_KEY environment variable.`);
  }

  switch (provider) {
    case 'openrouter': {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
      const openrouter = createOpenRouter({ apiKey });
      return { model: openrouter.chat(model) as unknown as LanguageModel };
    }

    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return { model: anthropic.chat(model) as unknown as LanguageModel };
    }

    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      return { model: google.chat(model) as unknown as LanguageModel };
    }

    case 'minimax': {
      const { createMinimax } = await import('vercel-minimax-ai-provider');
      const minimax = createMinimax({ apiKey });
      return { model: minimax.chat(model) as unknown as LanguageModel };
    }

    case 'zhipu': {
      const { createZhipu } = await import('zhipu-ai-provider');
      const zhipu = createZhipu({
        apiKey,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      });
      return { model: zhipu.chat(model) as unknown as LanguageModel };
    }

    case 'zhipu-coding': {
      const { createZhipu } = await import('zhipu-ai-provider');
      const zhipu = createZhipu({
        apiKey,
        baseURL: 'https://api.z.ai/api/coding/paas/v4',
      });
      return { model: zhipu.chat(model) as unknown as LanguageModel };
    }

    case 'openai':
    default: {
      const openai = createOpenAI({
        apiKey,
        baseURL: getLLMBaseUrl() || undefined,
      });
      return { model: openai.chat(model) as unknown as LanguageModel };
    }
  }
}

export async function getModel(modelId?: string, providerId?: string): Promise<LanguageModel> {
  const { model } = await getModelWithMetadata(modelId, providerId);
  return model;
}
