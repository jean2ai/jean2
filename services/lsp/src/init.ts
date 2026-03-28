import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import {
  saveConfig,
  isInitialized,
  clearConfigCache,
  getConfigPath,
} from './config';

export interface InitOptions {
  port?: number;
  host?: string;
  idleTimeoutMs?: number;
  force?: boolean;
}

export interface InitResult {
  success: boolean;
  error?: string;
  configPath: string;
  port: number;
  host: string;
  idleTimeoutMs: number;
}

export async function initLsp(options?: InitOptions): Promise<InitResult> {
  const port = options?.port ?? 8739;
  const host = options?.host ?? '0.0.0.0';
  const idleTimeoutMs = options?.idleTimeoutMs ?? 1800000;
  const force = options?.force ?? false;

  // Check if main server is initialized
  const mainConfigPath = join(homedir(), '.jean2', 'config.json');
  if (!existsSync(mainConfigPath)) {
    return {
      success: false,
      error: "Jean2 server is not initialized. Run 'jean2 init' first.",
      configPath: '',
      port,
      host,
      idleTimeoutMs,
    };
  }

  // Check if already initialized
  if (isInitialized() && !force) {
    return {
      success: false,
      error: 'LSP is already initialized. Use --force to re-initialize.',
      configPath: getConfigPath(),
      port,
      host,
      idleTimeoutMs,
    };
  }

  // Clear config cache if force reinitializing
  if (force) {
    clearConfigCache();
  }

  // Create config directory
  const configDir = join(homedir(), '.jean2', 'services', 'lsp');
  mkdirSync(configDir, { recursive: true });

  // Create .env template
  const envPath = join(configDir, '.env');
  writeFileSync(
    envPath,
    `# Jean2 LSP Service Environment Variables
#
# JEAN2_LSP_PORT=8739
# JEAN2_LSP_HOST=0.0.0.0
# JEAN2_LSP_IDLE_TIMEOUT_MS=1800000
`
  );

  // Save config
  saveConfig({
    port,
    host,
    idleTimeoutMs,
    initializedAt: new Date().toISOString(),
  });

  return {
    success: true,
    configPath: getConfigPath(),
    port,
    host,
    idleTimeoutMs,
  };
}
