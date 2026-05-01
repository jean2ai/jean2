import { atomicWriteFile, readFileSafe } from './files';
import { getEnvFilePath } from '../paths';
import { getJean2EnvValue, reloadJean2Env } from '../env';
import {
  ConfigurationNotFoundError,
  ConfigurationPersistenceError,
  ConfigurationValidationError,
} from './errors';
import type { ProviderCredentialStatus, ProviderCredentialsResponse } from '@jean2/sdk';

function getEnvFilePathForModule(): string {
  return getEnvFilePath();
}

const PROVIDER_CREDENTIALS: Array<{ provider: string; envKey: string }> = [
  { provider: 'anthropic', envKey: 'JEAN2_LLM_ANTHROPIC_API_KEY' },
  { provider: 'google', envKey: 'JEAN2_LLM_GOOGLE_API_KEY' },
  { provider: 'minimax', envKey: 'JEAN2_LLM_MINIMAX_API_KEY' },
  { provider: 'openai', envKey: 'JEAN2_LLM_OPENAI_API_KEY' },
  { provider: 'openrouter', envKey: 'JEAN2_LLM_OPENROUTER_API_KEY' },
  { provider: 'zhipu', envKey: 'JEAN2_LLM_ZHIPU_API_KEY' },
  { provider: 'zhipu-coding', envKey: 'JEAN2_LLM_ZHIPU_CODING_API_KEY' },
];

export function getSupportedProvider(provider: string): { provider: string; envKey: string } | undefined {
  return PROVIDER_CREDENTIALS.find(p => p.provider === provider);
}

export function listProviderCredentials(): ProviderCredentialsResponse {
  const providers = PROVIDER_CREDENTIALS.map(({ provider, envKey }) => ({
    provider,
    configured: isProviderConfigured(envKey),
  }));

  return { providers };
}

export async function setProviderCredential(provider: string, apiKey: string): Promise<ProviderCredentialStatus> {
  const cred = getSupportedProvider(provider);
  if (!cred) {
    throw new ConfigurationNotFoundError('provider', provider);
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new ConfigurationValidationError('API key must be a non-empty string');
  }

  try {
    const content = await readFileSafe(getEnvFilePathForModule());
    const lines = content ? content.split('\n') : [];
    const targetKey = cred.envKey;
    const targetValue = apiKey.trim();
    let keyFound = false;

    const updatedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return line;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      if (key === targetKey) {
        keyFound = true;
        return `${targetKey}=${targetValue}`;
      }

      return line;
    });

    if (!keyFound) {
      updatedLines.push(`${targetKey}=${targetValue}`);
    }

    await atomicWriteFile(getEnvFilePathForModule(), updatedLines.join('\n') + '\n');
    reloadJean2Env();

    return { provider, configured: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigurationPersistenceError(`Failed to set credential for ${provider}: ${message}`);
  }
}

export async function clearProviderCredential(provider: string): Promise<ProviderCredentialStatus> {
  const cred = getSupportedProvider(provider);
  if (!cred) {
    throw new ConfigurationNotFoundError('provider', provider);
  }

  try {
    const content = await readFileSafe(getEnvFilePathForModule());
    if (!content) {
      reloadJean2Env();
      return { provider, configured: false };
    }

    const lines = content.split('\n');
    const targetKey = cred.envKey;

    const updatedLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return true;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return true;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      return key !== targetKey;
    });

    await atomicWriteFile(getEnvFilePathForModule(), updatedLines.join('\n') + '\n');
    reloadJean2Env();

    return { provider, configured: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigurationPersistenceError(`Failed to clear credential for ${provider}: ${message}`);
  }
}

function isProviderConfigured(envKey: string): boolean {
  const value = getJean2EnvValue(envKey);
  return value !== undefined && value !== '';
}
