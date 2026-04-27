import { generateText, generateObject } from 'ai';
import { jsonSchema } from 'ai';
import type { LlmApi, LlmTextOptions, LlmStructuredOptions, LlmImage } from '@jean2/sdk';
import { getModelWithMetadata } from '../core/model-utils';

export function createLlmApi(defaultModelId?: string, defaultProviderId?: string): LlmApi {
  return {
    async generateText(options: LlmTextOptions): Promise<string> {
      const { model, omitMaxOutputTokens, providerOptions } = await getModelWithMetadata(
        options.model || defaultModelId,
        defaultProviderId,
        options.system,
      );

      const systemMessage = options.system ? { role: 'system' as const, content: options.system } : null;
      let userContent: string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string | Uint8Array; mimeType: string }> = options.prompt;

      if (options.image) {
        const images: LlmImage[] = Array.isArray(options.image) ? options.image : [options.image];
        userContent = [
          { type: 'text', text: options.prompt },
          ...images.map((img) => ({
            type: 'image' as const,
            image: img.data,
            mimeType: img.mediaType,
          })),
        ];
      }

      const messages = systemMessage
        ? [systemMessage, { role: 'user' as const, content: userContent }]
        : [{ role: 'user' as const, content: userContent }];

      const result = await generateText({
        model,
        messages: messages as any,
        maxOutputTokens: omitMaxOutputTokens ? undefined : (options.maxTokens ?? 4096),
        providerOptions: providerOptions as any,
      });

      return result.text;
    },

    async generateStructured<T = unknown>(options: LlmStructuredOptions): Promise<T> {
      const { model, omitMaxOutputTokens, providerOptions } = await getModelWithMetadata(
        options.model || defaultModelId,
        defaultProviderId,
        options.system,
      );

      const systemMessage = options.system ? { role: 'system' as const, content: options.system } : null;
      let userContent: string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string | Uint8Array; mimeType: string }> = options.prompt;

      if (options.image) {
        const images: LlmImage[] = Array.isArray(options.image) ? options.image : [options.image];
        userContent = [
          { type: 'text', text: options.prompt },
          ...images.map((img) => ({
            type: 'image' as const,
            image: img.data,
            mimeType: img.mediaType,
          })),
        ];
      }

      const messages = systemMessage
        ? [systemMessage, { role: 'user' as const, content: userContent }]
        : [{ role: 'user' as const, content: userContent }];

      const result = await generateObject({
        model,
        messages: messages as any,
        schema: jsonSchema(options.schema),
        maxOutputTokens: omitMaxOutputTokens ? undefined : (options.maxTokens ?? 4096),
        providerOptions: providerOptions as any,
      });

      return result.object as T;
    },
  };
}
