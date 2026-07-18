import { afterEach, describe, expect, test } from 'bun:test';
import { getModelWithMetadata } from '@/core/model-utils';

const originalOpenAIApiKey = process.env.JEAN2_LLM_OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAIApiKey === undefined) {
    delete process.env.JEAN2_LLM_OPENAI_API_KEY;
  } else {
    process.env.JEAN2_LLM_OPENAI_API_KEY = originalOpenAIApiKey;
  }
});

describe('getModelWithMetadata', () => {
  test('uses the OpenAI Responses connector with local storage disabled', async () => {
    process.env.JEAN2_LLM_OPENAI_API_KEY = 'test-key';

    const result = await getModelWithMetadata({
      modelId: 'gpt-5.6-luna',
      providerId: 'openai',
    });

    expect(typeof result.model).toBe('object');
    if (typeof result.model !== 'object') {
      throw new Error('Expected an AI SDK language model instance');
    }
    expect(result.model.provider).toBe('openai.responses');
    expect(result.providerOptions).toEqual({
      openai: {
        store: false,
      },
    });
    expect(result.providerOptions?.openai).not.toHaveProperty('forceReasoning');
  });
});
