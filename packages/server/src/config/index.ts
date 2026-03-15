import modelsConfig from './models.json';

// Maximum output tokens cap (like opencode's OUTPUT_TOKEN_MAX)
const parsedMaxTokens = parseInt(process.env.LLM_MAX_TOKENS || '32000', 10);
export const OUTPUT_TOKEN_MAX = Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0 
  ? parsedMaxTokens 
  : 32000;

export interface ModelDefinition {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: 'budget' | 'standard' | 'premium';
}

export interface ProviderDefinition {
  id: string;
  name: string;
  models: ModelDefinition[];
}

export interface ModelsConfig {
  providers: ProviderDefinition[];
  defaultModel: string;
  defaultProvider: string;
}

export function getModelsConfig(): ModelsConfig {
  return modelsConfig as ModelsConfig;
}

export function getAllModels(): Array<ModelDefinition & { providerId: string; providerName: string }> {
  const allModels: Array<ModelDefinition & { providerId: string; providerName: string }> = [];
  
  for (const provider of modelsConfig.providers) {
    for (const model of provider.models) {
      allModels.push({
        ...model,
        providerId: provider.id,
        providerName: provider.name,
      } as ModelDefinition & { providerId: string; providerName: string });
    }
  }
  
  return allModels;
}

export function findModel(modelId: string): (ModelDefinition & { providerId: string; providerName: string }) | undefined {
  return getAllModels().find(m => m.id === modelId);
}

/**
 * Get the effective max output tokens for a model.
 * Uses the minimum of the model's limit and OUTPUT_TOKEN_MAX (32000 by default).
 * Falls back to OUTPUT_TOKEN_MAX if model info is unavailable.
 */
export function getMaxOutputTokens(modelId?: string): number {
  if (!modelId) {
    return OUTPUT_TOKEN_MAX;
  }
  
  const model = findModel(modelId);
  
  if (!model || !model.maxOutputTokens) {
    return OUTPUT_TOKEN_MAX;
  }
  
  return Math.min(model.maxOutputTokens, OUTPUT_TOKEN_MAX);
}

export { modelsConfig };
