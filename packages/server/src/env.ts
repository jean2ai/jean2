import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const envOverlay = new Map<string, string>();

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
    envOverlay.set(key, cleanValue);
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

export function getModelsPath(): string | undefined {
  return process.env.JEAN2_MODELS_PATH;
}

export function getLLMOpenAIApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_OPENAI_API_KEY') ?? process.env.JEAN2_LLM_OPENAI_API_KEY;
}

export function getLLMAnthropicApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_ANTHROPIC_API_KEY') ?? process.env.JEAN2_LLM_ANTHROPIC_API_KEY;
}

export function getLLMOpenRouterApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_OPENROUTER_API_KEY') ?? process.env.JEAN2_LLM_OPENROUTER_API_KEY;
}

export function getLLMGoogleApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_GOOGLE_API_KEY') ?? process.env.JEAN2_LLM_GOOGLE_API_KEY;
}

export function getLLMMinimaxApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_MINIMAX_API_KEY') ?? process.env.JEAN2_LLM_MINIMAX_API_KEY;
}

export function getLLMZhipuApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_ZHIPU_API_KEY') ?? process.env.JEAN2_LLM_ZHIPU_API_KEY;
}

export function getLLMZhipuCodingApiKey(): string | undefined {
  return envOverlay.get('JEAN2_LLM_ZHIPU_CODING_API_KEY') ?? process.env.JEAN2_LLM_ZHIPU_CODING_API_KEY;
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

export function getLLMMaxSteps(): number {
  const parsed = parseInt(process.env.JEAN2_LLM_MAX_STEPS || '10', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export function getLLMSubagentMaxSteps(): number {
  const parsed = parseInt(process.env.JEAN2_LLM_SUBAGENT_MAX_STEPS || '50', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

export function getLLMApiKeys(): Record<string, string | undefined> {
  return {
    openai: getLLMOpenAIApiKey(),
    anthropic: getLLMAnthropicApiKey(),
    openrouter: getLLMOpenRouterApiKey(),
    google: getLLMGoogleApiKey(),
    minimax: getLLMMinimaxApiKey(),
    zhipu: getLLMZhipuApiKey(),
    'zhipu-coding': getLLMZhipuCodingApiKey(),
  };
}

export function hasAnyLLMApiKey(): boolean {
  const keys = getLLMApiKeys();
  return Object.values(keys).some(key => key !== undefined);
}

export function getCompactionModel(): string | undefined {
  return process.env.JEAN2_COMPACTION_MODEL;
}

export function getCompactionProvider(): string | undefined {
  return process.env.JEAN2_COMPACTION_PROVIDER;
}

export function getCompactionMaxTokens(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_MAX_TOKENS || '8000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
}

export function getCompactionAutoThresholdRatio(): number {
  const parsed = parseFloat(process.env.JEAN2_COMPACTION_AUTO_THRESHOLD_RATIO || '0.75');
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : 0.75;
}

export function getCompactionAutoReserveCapTokens(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_AUTO_RESERVE_CAP_TOKENS || '32000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 32000;
}

export function getCompactionAutoSafetyMarginTokens(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_AUTO_SAFETY_MARGIN_TOKENS || '20000', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20000;
}

export function getCompactionPreserveRecentToolCount(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_PRESERVE_RECENT_TOOL_COUNT || '3', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
}

export function getCompactionPreserveSmallToolChars(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_PRESERVE_SMALL_TOOL_CHARS || '200', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 200;
}

export function getCompactionToolClearCharsThreshold(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_TOOL_CLEAR_CHARS_THRESHOLD || '1000', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

export function getCompactionMaxPrunedToolCount(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_MAX_PRUNED_TOOL_COUNT || '50', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
}

const TOOL_SAFE_ENV_BASE: string[] = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'NODE_ENV',
];

export function getToolEnv(allowedEnv?: string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of TOOL_SAFE_ENV_BASE) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  if (allowedEnv) {
    for (const key of allowedEnv) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
  }

  return env;
}

export function getJean2EnvValue(key: string): string | undefined {
  return envOverlay.get(key);
}

export function reloadJean2Env(): void {
  envOverlay.clear();
  loadEnvFile();
}

export function getTlsEnabled(): boolean {
  return process.env.JEAN2_TLS_ENABLED === 'true';
}

export function getTlsCertFile(): string | undefined {
  return process.env.JEAN2_TLS_CERT_FILE;
}

export function getTlsKeyFile(): string | undefined {
  return process.env.JEAN2_TLS_KEY_FILE;
}
