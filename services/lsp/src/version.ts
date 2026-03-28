import { readFileSync } from 'fs';
import { join } from 'path';

declare const JEAN2_VERSION: string | undefined;

function getVersion(): string {
  if (typeof JEAN2_VERSION !== 'undefined') {
    return JEAN2_VERSION;
  }
  try {
    const versionPath = join(import.meta.dirname, '..', 'VERSION');
    return readFileSync(versionPath, 'utf-8').trim();
  } catch {
    return '0.0.0-dev';
  }
}

export const VERSION = getVersion();
