import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function getVersion(): string {
  try {
    const versionPath = join(__dirname, 'VERSION');
    return readFileSync(versionPath, 'utf-8').trim();
  } catch {
    return '0.0.0-dev';
  }
}

export const VERSION = getVersion();
