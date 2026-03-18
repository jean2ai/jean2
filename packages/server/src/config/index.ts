import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

import modelsConfig from './models.json';
import {
  getDatabasePath as getEnvDatabasePath,
  getToolsPath as getEnvToolsPath,
  getPort as getEnvPort,
  getHost as getEnvHost,
  getLLMMaxTokens,
} from '../env';

// NotInitializedError for when config doesn't exist
export class NotInitializedError extends Error {
  constructor(message = 'Jean2 is not initialized. Run "jean2 init" first.') {
    super(message);
    this.name = 'NotInitializedError';
  }
}

let configCache: { databasePath: string; toolsPath: string; port: number; host: string } | null = null;

function loadConfig(): { databasePath: string; toolsPath: string; port: number; host: string } {
  if (configCache) {
    return configCache;
  }

  const configPath = join(homedir(), '.jean2', 'config.json');

  if (!existsSync(configPath)) {
    throw new NotInitializedError();
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    configCache = {
      databasePath: config.databasePath || join(homedir(), '.jean2', 'data', 'agent.db'),
      toolsPath: config.toolsPath || join(homedir(), '.jean2', 'tools'),
      port: config.port || 8742,
      host: config.host || '0.0.0.0',
    };
    return configCache;
  } catch {
    throw new NotInitializedError('Invalid config file. Run "jean2 init" first.');
  }
}

export function isInitialized(): boolean {
  try {
    loadConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the database path using the following priority:
 * 1. JEAN2_DATABASE_PATH environment variable (highest priority)
 * 2. Path from ~/.jean2/config.json
 * 3. Default: ~/.jean2/data/agent.db
 */
export function resolveDatabasePath(): string {
  return getEnvDatabasePath() || loadConfig().databasePath;
}

/**
 * Resolve the tools path using the following priority:
 * 1. JEAN2_TOOLS_PATH environment variable (highest priority)
 * 2. Path from ~/.jean2/config.json
 * 3. Default: ~/.jean2/tools
 */
export function resolveToolsPath(): string {
  return getEnvToolsPath() || loadConfig().toolsPath;
}

// Get port from config (or env override)
export function getPort(): number {
  return getEnvPort();
}

// Get host from config (or env override)
export function getHost(): string {
  return getEnvHost();
}

// Maximum output tokens cap (like opencode's OUTPUT_TOKEN_MAX)
export const OUTPUT_TOKEN_MAX = getLLMMaxTokens();

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

// Get the config directory path (~/.jean2)
export function getConfigDir(): string {
  return join(homedir(), '.jean2');
}

// Get the config file path (~/.jean2/config.json)
export function getConfigPath(): string {
  return join(homedir(), '.jean2', 'config.json');
}

// Get the default database path (~/.jean2/data/agent.db)
export function getDefaultDatabasePath(): string {
  return join(homedir(), '.jean2', 'data', 'agent.db');
}

// Get the default tools path (~/.jean2/tools)
export function getDefaultToolsPath(): string {
  return join(homedir(), '.jean2', 'tools');
}

// Config interface for init
export interface Jean2Config {
  databasePath: string;
  toolsPath: string;
  port: number;
  host: string;
  initializedAt: string;
  version: string;
}

// Save the config (creates directory if needed)
export function saveConfig(config: Jean2Config): void {
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// Clear the config cache (needed when re-initializing)
export function clearConfigCache(): void {
  configCache = null;
}
