import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { get } from 'https';
import { get as getHttp } from 'http';

import { resolveToolsPath, getDefaultToolsPath } from '../config';
import { clearCache as clearToolsCache } from './registry';
import { resolveDownloadUrl, type ResolvedToolEntry, type RegistryConfig } from './tool-repository';

const VERSION_FILE = 'VERSION';
const INSTALL_MANIFEST = '.install-manifest.json';

export interface InstallManifest {
  version: string;
  installedAt: string;
  downloadUrl: string;
}

export interface InstallOptions {
  force?: boolean;
  skipPostInstall?: boolean;
}

export interface InstallResult {
  success: boolean;
  toolName: string;
  version: string;
  error?: string;
  skipped?: boolean;
  postInstallOutput?: string;
}

export interface RemoveResult {
  success: boolean;
  toolName: string;
  error?: string;
}

export interface ToolVersionInfo {
  name: string;
  installedVersion: string | null;
  isInstalled: boolean;
}

function getToolDir(toolName: string): string {
  return join(resolveToolsPath(), toolName);
}

function getVersionFilePath(toolName: string): string {
  return join(getToolDir(toolName), VERSION_FILE);
}

function getManifestPath(toolName: string): string {
  return join(getToolDir(toolName), INSTALL_MANIFEST);
}

function getInstalledVersion(toolName: string): string | null {
  const versionPath = getVersionFilePath(toolName);
  if (!existsSync(versionPath)) {
    return null;
  }
  try {
    return readFileSync(versionPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

function saveManifest(toolName: string, manifest: InstallManifest): void {
  const manifestPath = getManifestPath(toolName);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function ensureToolsDir(): string {
  const toolsDir = resolveToolsPath();
  if (!existsSync(toolsDir)) {
    mkdirSync(toolsDir, { recursive: true });
  }
  return toolsDir;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const file = createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? get : getHttp;

    const request = protocol(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      pipeline(response, file)
        .then(resolve)
        .catch(reject);
    });

    request.on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

async function extractTarGz(tarPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', tarPath, '-C', destDir], {
      cwd: destDir,
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar extraction failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

async function runPostInstall(toolDir: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: toolDir,
      stdio: 'pipe',
      env: { ...process.env, HOME: homedir() },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`postInstall failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

function clearRegistryCache(): void {
  clearToolsCache();
}

export async function installTool(
  tool: ResolvedToolEntry,
  registry: RegistryConfig,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const toolDir = getToolDir(tool.name);
  const downloadUrl = resolveDownloadUrl(registry, tool.name, tool.version);

  const installedVersion = getInstalledVersion(tool.name);

  if (installedVersion === tool.version && !options.force) {
    return {
      success: true,
      toolName: tool.name,
      version: tool.version,
      skipped: true,
    };
  }

  ensureToolsDir();

  if (existsSync(toolDir)) {
    if (options.force) {
      rmSync(toolDir, { recursive: true, force: true });
    } else {
      return {
        success: false,
        toolName: tool.name,
        version: tool.version,
        error: `Tool already installed at ${toolDir}. Use --force to reinstall.`,
      };
    }
  }

  mkdirSync(toolDir, { recursive: true });

  const tarPath = join(toolDir, 'download.tar.gz');

  try {
    await downloadFile(downloadUrl, tarPath);
  } catch (err: unknown) {
    rmSync(toolDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName: tool.name,
      version: tool.version,
      error: `Download failed: ${message}`,
    };
  }

  try {
    await extractTarGz(tarPath, toolDir);
    rmSync(tarPath, { force: true });
  } catch (err: unknown) {
    rmSync(toolDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName: tool.name,
      version: tool.version,
      error: `Extraction failed: ${message}`,
    };
  }

  const manifest: InstallManifest = {
    version: tool.version,
    installedAt: new Date().toISOString(),
    downloadUrl,
  };
  saveManifest(tool.name, manifest);

  let postInstallOutput: string | undefined;
  if (tool.postInstall && !options.skipPostInstall) {
    try {
      postInstallOutput = await runPostInstall(toolDir, tool.postInstall);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        toolName: tool.name,
        version: tool.version,
        error: `Post-install failed: ${message}`,
      };
    }
  }

  clearRegistryCache();

  return {
    success: true,
    toolName: tool.name,
    version: tool.version,
    postInstallOutput,
  };
}

export async function removeTool(toolName: string): Promise<RemoveResult> {
  const toolDir = getToolDir(toolName);

  if (!existsSync(toolDir)) {
    return {
      success: false,
      toolName,
      error: `Tool ${toolName} is not installed`,
    };
  }

  try {
    rmSync(toolDir, { recursive: true, force: true });
    clearRegistryCache();
    return {
      success: true,
      toolName,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName,
      error: `Failed to remove tool: ${message}`,
    };
  }
}

export function getInstalledTools(): ToolVersionInfo[] {
  const toolsDir = resolveToolsPath();

  if (!existsSync(toolsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(toolsDir, { withFileTypes: true });

    return entries
      .filter((entry: { isDirectory: () => boolean }) => entry.isDirectory())
      .map((entry: { name: string }) => {
        const name = entry.name;
        const version = getInstalledVersion(name);
        return {
          name,
          installedVersion: version,
          isInstalled: version !== null,
        };
      });
  } catch {
    return [];
  }
}

export function isToolInstalled(toolName: string): boolean {
  return getInstalledVersion(toolName) !== null;
}

export function getToolInstallDir(toolName: string): string {
  return getToolDir(toolName);
}

export function getToolsBaseDir(): string {
  return resolveToolsPath();
}

export function getDefaultToolsBaseDir(): string {
  return getDefaultToolsPath();
}

export function clearCache(): void {
  clearRegistryCache();
}
