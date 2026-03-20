import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

function loadEnvFile(): void {
  const envPath = join(homedir(), '.jean2', 'services', 'lsp', '.env');
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

export function getPort(): number {
  const parsed = parseInt(process.env.JEAN2_LSP_PORT || '8739', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8739;
}

export function getHost(): string {
  return process.env.JEAN2_LSP_HOST || '0.0.0.0';
}

export function getIdleTimeoutMs(): number {
  const parsed = parseInt(process.env.JEAN2_LSP_IDLE_TIMEOUT_MS || '180000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180000;
}
