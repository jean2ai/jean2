import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function getVersion(): string {
  try {
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export const VERSION = getVersion();
