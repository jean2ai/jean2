import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { LoadedTool } from '@jean2/sdk';
import { resolveToolsPath, getDefaultToolsPath } from '../config';
import { clearCache as clearToolsCache } from './registry';

const VERSION_FILE = 'VERSION';
const INSTALL_MANIFEST = '.install-manifest.json';

export interface InstallManifest {
  version: string | null;
  installedAt: string;
  sourcePath?: string;
  sourceUrl?: string;
}

export interface InstallResult {
  success: boolean;
  toolName: string;
  version?: string;
  error?: string;
}

export interface InstalledTool {
  name: string;
  version: string | null;
  path: string;
}

function ensureToolsDir(toolsDir: string): string {
  if (!existsSync(toolsDir)) {
    mkdirSync(toolsDir, { recursive: true });
  }
  return toolsDir;
}

function getToolDir(toolsDir: string, toolName: string): string {
  return join(toolsDir, toolName);
}

function getManifestPath(toolsDir: string, toolName: string): string {
  return join(getToolDir(toolsDir, toolName), INSTALL_MANIFEST);
}

function getVersionPath(toolsDir: string, toolName: string): string {
  return join(getToolDir(toolsDir, toolName), VERSION_FILE);
}

function readManifest(toolsDir: string, toolName: string): InstallManifest | null {
  const manifestPath = getManifestPath(toolsDir, toolName);
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

function saveManifest(toolsDir: string, toolName: string, manifest: InstallManifest): void {
  const manifestPath = getManifestPath(toolsDir, toolName);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function readVersion(toolsDir: string, toolName: string): string | null {
  const versionPath = getVersionPath(toolsDir, toolName);
  if (!existsSync(versionPath)) {
    return null;
  }
  try {
    return readFileSync(versionPath, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function copyDirectoryRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
    }
  }
}

async function extractArchive(
  archivePath: string,
  destDir: string,
): Promise<void> {
  const ext = archivePath.toLowerCase();

  if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
    return extractTarGz(archivePath, destDir);
  } else if (ext.endsWith('.zip')) {
    return extractZip(archivePath, destDir);
  } else {
    throw new Error(`Unsupported archive format: ${ext}`);
  }
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
        reject(new Error(`tar extraction failed: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-o', zipPath, '-d', destDir], {
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
        reject(new Error(`unzip extraction failed: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

async function validateToolModule(toolPath: string): Promise<{ name: string }> {
  try {
    const module = await import(toolPath);

    if (!module.definition || typeof module.execute !== 'function') {
      throw new Error('Tool must export "definition" and "execute"');
    }

    const name = module.definition.name;
    if (!name) {
      throw new Error('tool.definition.name is required');
    }

    return {
      name,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load tool module: ${message}`, { cause: err });
  }
}

export interface RemoveResult {
  success: boolean;
  toolName: string;
  error?: string;
}

export async function installTool(
  sourcePath: string,
  toolsDir: string,
): Promise<InstallResult> {
  ensureToolsDir(toolsDir);

  if (!existsSync(sourcePath)) {
    return {
      success: false,
      toolName: '',
      error: `Source path does not exist: ${sourcePath}`,
    };
  }

  const toolJsPath = join(sourcePath, 'tool.js');
  const toolTsPath = join(sourcePath, 'tool.ts');
  if (!existsSync(toolJsPath) && !existsSync(toolTsPath)) {
    return {
      success: false,
      toolName: '',
      error: 'Source directory must contain tool.js or tool.ts',
    };
  }
  const modulePath = existsSync(toolJsPath) ? toolJsPath : toolTsPath;

  let toolName: string;

  try {
    const validated = await validateToolModule(modulePath);
    toolName = validated.name;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName: '',
      error: message,
    };
  }

  const targetDir = getToolDir(toolsDir, toolName);

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  mkdirSync(targetDir, { recursive: true });
  copyDirectoryRecursive(sourcePath, targetDir);

  const version = readVersion(toolsDir, toolName);

  const manifest: InstallManifest = {
    version,
    installedAt: new Date().toISOString(),
    sourcePath,
  };
  saveManifest(toolsDir, toolName, manifest);

  clearToolsCache();

  return {
    success: true,
    toolName,
    version: version || undefined,
  };
}

export async function installToolFromUrl(
  url: string,
  toolName: string,
  toolsDir: string,
): Promise<InstallResult> {
  ensureToolsDir(toolsDir);

  const tempDir = join(toolsDir, `.install-temp-${Date.now()}`);

  mkdirSync(tempDir, { recursive: true });

  const archivePath = join(tempDir, 'archive');

  let response: Response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    await Bun.write(archivePath, buffer);
  } catch (err: unknown) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName,
      error: `Download failed: ${message}`,
    };
  }

  try {
    await extractArchive(archivePath, tempDir);
  } catch (err: unknown) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName,
      error: `Extraction failed: ${message}`,
    };
  }

  const entries = readdirSync(tempDir, { withFileTypes: true });
  const extractedDir = entries.length === 1 && entries[0].isDirectory()
    ? join(tempDir, entries[0].name)
    : tempDir;

  const toolJsPath = join(extractedDir, 'tool.js');
  const toolTsPath = join(extractedDir, 'tool.ts');
  if (!existsSync(toolJsPath) && !existsSync(toolTsPath)) {
    rmSync(tempDir, { recursive: true, force: true });
    return {
      success: false,
      toolName,
      error: 'Archive does not contain tool.js or tool.ts',
    };
  }
  const modulePath = existsSync(toolJsPath) ? toolJsPath : toolTsPath;

  let resolvedToolName: string;

  try {
    const validated = await validateToolModule(modulePath);
    resolvedToolName = validated.name;
  } catch (err: unknown) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      toolName,
      error: message,
    };
  }

  const finalTargetDir = getToolDir(toolsDir, resolvedToolName);

  if (existsSync(finalTargetDir)) {
    rmSync(finalTargetDir, { recursive: true, force: true });
  }

  mkdirSync(finalTargetDir, { recursive: true });

  const files = readdirSync(extractedDir, { withFileTypes: true });
  for (const entry of files) {
    const src = join(extractedDir, entry.name);
    const dest = join(finalTargetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(src, dest);
    } else {
      const content = readFileSync(src);
      writeFileSync(dest, content);
    }
  }

  rmSync(tempDir, { recursive: true, force: true });

  const version = readVersion(toolsDir, resolvedToolName);

  const manifest: InstallManifest = {
    version,
    installedAt: new Date().toISOString(),
    sourceUrl: url,
  };
  saveManifest(toolsDir, resolvedToolName, manifest);

  clearToolsCache();

  return {
    success: true,
    toolName: resolvedToolName,
    version: version || undefined,
  };
}

export async function removeTool(
  toolName: string,
  toolsDir: string,
): Promise<RemoveResult> {
  const toolDir = getToolDir(toolsDir, toolName);

  if (!existsSync(toolDir)) {
    return {
      success: false,
      toolName,
      error: `Tool ${toolName} is not installed`,
    };
  }

  rmSync(toolDir, { recursive: true, force: true });
  clearToolsCache();

  return {
    success: true,
    toolName,
  };
}

export async function getInstalledTools(
  toolsDir: string,
): Promise<InstalledTool[]> {
  if (!existsSync(toolsDir)) {
    return [];
  }

  const tools: InstalledTool[] = [];

  try {
    const entries = readdirSync(toolsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const toolName = entry.name;
      const toolJsPath = join(toolsDir, toolName, 'tool.js');
      const toolTsPath = join(toolsDir, toolName, 'tool.ts');

      if (!existsSync(toolJsPath) && !existsSync(toolTsPath)) continue;

      const modulePath = existsSync(toolJsPath) ? toolJsPath : toolTsPath;

      let loadedTool: LoadedTool | null = null;
      try {
        const module = await import(modulePath);
        if (module.definition && typeof module.execute === 'function') {
          loadedTool = module as LoadedTool;
        }
      } catch {
        continue;
      }

      if (!loadedTool) continue;

      const version = readVersion(toolsDir, toolName) ||
        readManifest(toolsDir, toolName)?.version ||
        null;

      tools.push({
        name: toolName,
        version,
        path: join(toolsDir, toolName),
      });
    }
  } catch {
    return [];
  }

  return tools;
}

export async function isToolInstalled(
  toolName: string,
  toolsDir: string,
): Promise<boolean> {
  const toolDir = getToolDir(toolsDir, toolName);
  if (!existsSync(toolDir)) {
    return false;
  }
  const toolJsPath = join(toolDir, 'tool.js');
  const toolTsPath = join(toolDir, 'tool.ts');
  return existsSync(toolJsPath) || existsSync(toolTsPath);
}

export async function getInstalledToolVersion(
  toolName: string,
  toolsDir: string,
): Promise<string | null> {
  const version = readVersion(toolsDir, toolName);
  if (version !== null) {
    return version;
  }

  const manifest = readManifest(toolsDir, toolName);
  return manifest?.version ?? null;
}

export function getToolInstallDir(toolName: string): string {
  return getToolDir(resolveToolsPath(), toolName);
}

export function getToolsBaseDir(): string {
  return resolveToolsPath();
}

export function getDefaultToolsBaseDir(): string {
  return getDefaultToolsPath();
}

export function clearCache(): void {
  clearToolsCache();
}
