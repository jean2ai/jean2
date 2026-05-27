import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const INSTALL_MANIFEST = '.install-manifest.json';

export interface InstallManifest {
  toolName: string;
  toolVersion: string | null;
  installedAt: string;
  sourceUrl?: string;
  sourcePath?: string;
  artifactSha256?: string;
  entry: string;
  runtime: 'bun';
  packageName?: string;
  packageVersion?: string;
  installStrategy: 'source+npm' | 'source+npm+bundle';
  sdkVersion?: string;
  sdkIntegrity?: string;
}

export function readInstallManifest(
  toolsDir: string,
  toolName: string,
): InstallManifest | null {
  const manifestPath = join(toolsDir, toolName, INSTALL_MANIFEST);
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as InstallManifest;
  } catch {
    return null;
  }
}

export function writeInstallManifest(
  toolDir: string,
  manifest: InstallManifest,
): void {
  const manifestPath = join(toolDir, INSTALL_MANIFEST);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function getManifestPath(toolDir: string): string {
  return join(toolDir, INSTALL_MANIFEST);
}
