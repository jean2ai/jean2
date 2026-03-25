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

export function getModelsPath(): string | undefined {
  return process.env.JEAN2_MODELS_PATH;
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

export function getLLMZhipuApiKey(): string | undefined {
  return process.env.JEAN2_LLM_ZHIPU_API_KEY;
}

export function getLLMZhipuCodingApiKey(): string | undefined {
  return process.env.JEAN2_LLM_ZHIPU_CODING_API_KEY;
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
  const parsed = parseInt(process.env.JEAN2_COMPACTION_MAX_TOKENS || '2000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

// ===========================================
// Compaction Auto-Threshold (Hybrid Formula)
// ===========================================

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

// ===========================================
// Compaction Pruning (WS4: Budget-aware pruning)
// ===========================================

/**
 * Number of recent completed tool outputs to preserve when pruning.
 * Protects the N most recent eligible tool outputs from being marked as compacted.
 * Default: 3 (preserves a handful of recent tools)
 */
export function getCompactionPreserveRecentToolCount(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_PRESERVE_RECENT_TOOL_COUNT || '3', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
}

/**
 * Character count threshold for "small" tool outputs that should be preserved.
 * Tool outputs smaller than or equal to this size will not be marked as compacted.
 * Default: 200 chars (preserves tiny outputs like simple confirmations)
 */
export function getCompactionPreserveSmallToolChars(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_PRESERVE_SMALL_TOOL_CHARS || '200', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 200;
}

/**
 * Minimum character count threshold for clearing tool outputs.
 * Tool outputs larger than preserveSmallToolChars but smaller than this threshold
 * will be preserved. Only outputs exceeding this threshold will be considered for clearing.
 * Default: 1000 chars (only clears outputs that are moderately large)
 */
export function getCompactionToolClearCharsThreshold(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_TOOL_CLEAR_CHARS_THRESHOLD || '1000', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

/**
 * Maximum number of tools to mark as compacted per compaction event.
 * Limits the scope of pruning to avoid overwhelming the system.
 * Default: 50 (reasonable limit per compaction)
 */
export function getCompactionMaxPrunedToolCount(): number {
  const parsed = parseInt(process.env.JEAN2_COMPACTION_MAX_PRUNED_TOOL_COUNT || '50', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
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
