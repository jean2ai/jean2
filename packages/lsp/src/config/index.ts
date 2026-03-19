import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

import {
  getPort as getEnvPort,
  getHost as getEnvHost,
  getIdleTimeoutMs as getEnvIdleTimeoutMs,
} from '../env';

export class NotInitializedError extends Error {
  constructor(message = 'LSP is not initialized. Run "jean2 init" first.') {
    super(message);
    this.name = 'NotInitializedError';
  }
}

export interface LspConfig {
  port: number;
  host: string;
  idleTimeoutMs: number;
  initializedAt: string;
  version: string;
}

let configCache: LspConfig | null = null;

export function getConfigDir(): string {
  return join(homedir(), '.jean2', 'services', 'lsp');
}

export function getConfigPath(): string {
  return join(homedir(), '.jean2', 'services', 'lsp', 'config.json');
}

export function isInitialized(): boolean {
  try {
    loadConfig();
    return true;
  } catch {
    return false;
  }
}

function loadConfig(): LspConfig {
  if (configCache) {
    return configCache;
  }

  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new NotInitializedError();
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    configCache = {
      port: config.port ?? 8739,
      host: config.host ?? '0.0.0.0',
      idleTimeoutMs: config.idleTimeoutMs ?? 1800000,
      initializedAt: config.initializedAt ?? '',
      version: config.version ?? '',
    };

    return configCache;
  } catch {
    throw new NotInitializedError('Invalid config file. Run "jean2 init" first.');
  }
}

export function saveConfig(config: LspConfig): void {
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  configCache = config;
}

export function clearConfigCache(): void {
  configCache = null;
}

export function getPort(): number {
  return getEnvPort();
}

export function getHost(): string {
  return getEnvHost();
}

export function getIdleTimeoutMs(): number {
  return getEnvIdleTimeoutMs();
}
