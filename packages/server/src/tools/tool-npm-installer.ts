import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Arborist from '@npmcli/arborist';

export class NpmInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NpmInstallError';
  }
}

export interface NpmInstallOptions {
  toolDir: string;
  registry?: string;
  cacheDir?: string;
}

export interface NpmInstallResult {
  success: boolean;
  installedCount: number;
  packageJson?: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
  };
}

function getDefaultNpmCacheDir(): string {
  return process.env.JEAN2_NPM_CACHE_DIR || join(homedir(), '.jean2', 'npm-cache');
}

function getRegistry(): string {
  return process.env.JEAN2_NPM_REGISTRY || 'https://registry.npmjs.org';
}

export async function installDependencies(
  options: NpmInstallOptions,
): Promise<NpmInstallResult> {
  const { toolDir } = options;
  const pkgJsonPath = join(toolDir, 'package.json');

  if (!existsSync(pkgJsonPath)) {
    return {
      success: true,
      installedCount: 0,
    };
  }

  let pkgJson: { name?: string; version?: string; dependencies?: Record<string, string> };
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    throw new NpmInstallError(`Failed to parse package.json in ${toolDir}`);
  }

  const hasDeps =
    pkgJson.dependencies && Object.keys(pkgJson.dependencies).length > 0;

  if (!hasDeps) {
    return {
      success: true,
      installedCount: 0,
      packageJson: pkgJson,
    };
  }

  const registry = options.registry || getRegistry();
  const cacheDir = options.cacheDir || getDefaultNpmCacheDir();

  try {
    const arb = new Arborist({
      path: toolDir,
      registry,
      cache: cacheDir,
    });

    const tree = await arb.reify();
    const installedCount = tree?.children?.size || 0;

    return {
      success: true,
      installedCount,
      packageJson: pkgJson,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NpmInstallError(
      `npm dependency install failed in ${toolDir}: ${message}`,
    );
  }
}
