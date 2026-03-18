import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

function loadEnvFile(): void {
  const envPath = join(homedir(), '.jean2', '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    const cleanValue = value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1)
      : value.startsWith("'") && value.endsWith("'")
        ? value.slice(1, -1)
        : value;

    if (process.env[key] === undefined) {
      process.env[key] = cleanValue;
    }
  }
}

loadEnvFile();

export function getDatabasePath(): string | undefined {
  return process.env.JEAN2_DATABASE_PATH;
}

export function getPort(): number {
  const parsed = parseInt(process.env.JEAN2_PORT || '8742', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8742;
}

export function getHost(): string {
  return process.env.JEAN2_HOST || '0.0.0.0';
}

export function getDisableAuth(): boolean {
  return process.env.JEAN2_DISABLE_AUTH === 'true';
}

export function getToolsPath(): string {
  return process.env.JEAN2_TOOLS_PATH || join(homedir(), '.jean2', 'tools');
}

export function getPreconfigsPath(): string {
  return process.env.JEAN2_PRECONFIGS_PATH || join(homedir(), '.jean2', 'preconfigs');
}

export function getLLMOpenAIApiKey(): string | undefined {
  return process.env.JEAN2_LLM_OPENAI_API_KEY;
}

export function getLLMAnthropicApiKey(): string | undefined {
  return process.env.JEAN2_LLM_ANTHROPIC_API_KEY;
}

export function getLLMOpenRouterApiKey(): string | undefined {
  return process.env.JEAN2_LLM_OPENROUTER_API_KEY;
}

export function getLLMGoogleApiKey(): string | undefined {
  return process.env.JEAN2_LLM_GOOGLE_API_KEY;
}

export function getLLMMinimaxApiKey(): string | undefined {
  return process.env.JEAN2_LLM_MINIMAX_API_KEY;
}

export function getLLMBaseUrl(): string | undefined {
  return process.env.JEAN2_LLM_BASE_URL;
}

export function getLLMTemperature(): number {
  const parsed = parseFloat(process.env.JEAN2_LLM_TEMPERATURE || '0.7');
  return Number.isFinite(parsed) ? parsed : 0.7;
}

export function getLLMMaxTokens(): number {
  const parsed = parseInt(process.env.JEAN2_LLM_MAX_TOKENS || '32000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 32000;
}

export function getLLMApiKeys(): Record<string, string | undefined> {
  return {
    openai: getLLMOpenAIApiKey(),
    anthropic: getLLMAnthropicApiKey(),
    openrouter: getLLMOpenRouterApiKey(),
    google: getLLMGoogleApiKey(),
    minimax: getLLMMinimaxApiKey(),
  };
}

export function hasAnyLLMApiKey(): boolean {
  const keys = getLLMApiKeys();
  return Object.values(keys).some(key => key !== undefined);
}

export function getToolEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  const sensitivePatterns = [
    /_API_KEY$/i,
    /_SECRET$/i,
    /_TOKEN$/i,
    /_PASSWORD$/i,
    /^JEAN2_DATABASE_PATH$/i,
  ];

  for (const key of Object.keys(env)) {
    if (sensitivePatterns.some(pattern => pattern.test(key))) {
      delete env[key];
    }
  }

  return env;
}
