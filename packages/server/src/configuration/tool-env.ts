import { homedir } from 'os';
import { join } from 'path';
import { atomicWriteFile, readFileSafe } from './files';
import { getJean2EnvValue, reloadJean2Env } from '../env';
import { listTools } from '../tools/registry';
import { ConfigurationPersistenceError, ConfigurationValidationError } from './errors';

const ENV_FILE_PATH = join(homedir(), '.jean2', '.env');

const SENSITIVE_PATTERNS = [
  'API_KEY',
  'SECRET',
  'TOKEN',
  'PASSWORD',
  'PRIVATE_KEY',
  'AUTH',
  'CREDENTIAL',
];

export interface ToolEnvVarStatus {
  key: string;
  configured: boolean;
  sensitive: boolean;
  value?: string;
  description?: string;
  defaultValue?: string;
  example?: string;
  usedBy?: string[];
}

export interface ToolEnvStatus {
  envVars: ToolEnvVarStatus[];
}

export function isSensitiveEnvKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_PATTERNS.some(pattern => upperKey.includes(pattern));
}

export async function listToolEnvVars(): Promise<ToolEnvStatus> {
  const tools = await listTools();

  const envVarToolsMap = new Map<string, string[]>();

  for (const tool of tools) {
    const envVars = tool.env;
    if (!envVars || !Array.isArray(envVars)) {
      continue;
    }

    for (const envVar of envVars) {
      const existing = envVarToolsMap.get(envVar) || [];
      existing.push(tool.name);
      envVarToolsMap.set(envVar, existing);
    }
  }

  const uniqueEnvVars = Array.from(envVarToolsMap.keys());
  const envVars: ToolEnvVarStatus[] = [];

  for (const key of uniqueEnvVars) {
    const value = getJean2EnvValue(key);
    const configured = value !== undefined && value !== '';
    const sensitive = isSensitiveEnvKey(key);

    const status: ToolEnvVarStatus = {
      key,
      configured,
      sensitive,
      usedBy: envVarToolsMap.get(key),
    };

    if (!sensitive && configured) {
      status.value = value;
    }

    envVars.push(status);
  }

  envVars.sort((a, b) => a.key.localeCompare(b.key));

  return { envVars };
}

export async function setToolEnvVar(key: string, value: string): Promise<ToolEnvVarStatus> {
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new ConfigurationValidationError('Environment variable key must be a non-empty string');
  }

  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new ConfigurationValidationError('Environment variable value must be a non-empty string');
  }

  const trimmedKey = key.trim();
  const trimmedValue = value.trim();
  const sensitive = isSensitiveEnvKey(trimmedKey);

  try {
    const content = await readFileSafe(ENV_FILE_PATH);
    const lines = content ? content.split('\n') : [];
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

      const existingKey = trimmed.slice(0, eqIndex).trim();
      if (existingKey === trimmedKey) {
        keyFound = true;
        return `${trimmedKey}=${trimmedValue}`;
      }

      return line;
    });

    if (!keyFound) {
      updatedLines.push(`${trimmedKey}=${trimmedValue}`);
    }

    await atomicWriteFile(ENV_FILE_PATH, updatedLines.join('\n') + '\n');
    reloadJean2Env();

    const status: ToolEnvVarStatus = {
      key: trimmedKey,
      configured: true,
      sensitive,
    };

    if (!sensitive) {
      status.value = trimmedValue;
    }

    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigurationPersistenceError(`Failed to set environment variable ${trimmedKey}: ${message}`);
  }
}

export async function clearToolEnvVar(key: string): Promise<ToolEnvVarStatus> {
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new ConfigurationValidationError('Environment variable key must be a non-empty string');
  }

  const trimmedKey = key.trim();
  const sensitive = isSensitiveEnvKey(trimmedKey);

  try {
    const content = await readFileSafe(ENV_FILE_PATH);
    if (!content) {
      reloadJean2Env();
      return {
        key: trimmedKey,
        configured: false,
        sensitive,
      };
    }

    const lines = content.split('\n');

    const updatedLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return true;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return true;
      }

      const existingKey = trimmed.slice(0, eqIndex).trim();
      return existingKey !== trimmedKey;
    });

    await atomicWriteFile(ENV_FILE_PATH, updatedLines.join('\n') + '\n');
    reloadJean2Env();

    return {
      key: trimmedKey,
      configured: false,
      sensitive,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigurationPersistenceError(`Failed to clear environment variable ${trimmedKey}: ${message}`);
  }
}
