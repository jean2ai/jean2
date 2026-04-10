import type { ToolRuntime } from '@jean2/sdk';

/**
 * Tool Repository Manager
 * 
 * Handles fetching the remote tool catalog, resolving versions from VERSION files,
 * and providing helpers for extension/env var queries.
 */

export type Platform = 'darwin' | 'linux' | 'win32';

export interface RegistryConfig {
  baseUrl: string;
  urlTemplate: string;
  versionUrlTemplate: string;
}

export interface ToolPackageDef {
  name: string;
  runtime: ToolRuntime;
  platforms?: string[];
  requiredRuntimes?: string[];
  postInstall?: string | null;
}

export interface ToolCatalogEntry {
  description: string;
  packages: ToolPackageDef[];
  runtime?: ToolRuntime;
  requiredRuntimes?: string[];
  postInstall?: string | null;
  extensions: string[];
  tags: string[];
  dangerous: boolean;
}

export interface LanguageServerDef {
  name: string;
  languages: string[];
  installCommand: string;
  optional: boolean;
}

export interface EnvVarDef {
  description: string;
  default: string;
  configFile: string;
  example?: string;
  usedBy?: string[];
}

export interface ExtensionDef {
  name: string;
  description: string;
  installUrl: string;
  installCommand: string;
  setupSteps: string[];
  languageServers: LanguageServerDef[];
  envConfig?: Record<string, EnvVarDef>;
  usedBy: string[];
  requiredFor: string[];
  optionalFor: string[];
}

export interface ResolvedToolEntry {
  name: string;
  packageName: string;
  version: string;
  description: string;
  runtime: ToolRuntime;
  requiredRuntimes: string[];
  postInstall: string | null;
  extensions: string[];
  tags: string[];
  dangerous: boolean;
  platforms: string[];
}

export interface PackageResolution {
  pkg: ToolPackageDef;
  warnings: string[];
  error?: string;
}

export interface ToolRepository {
  version: number;
  registry: RegistryConfig;
  tools: Record<string, ToolCatalogEntry>;
  extensions: Record<string, ExtensionDef>;
  envConfig?: Record<string, EnvVarDef>;
}

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/rabbyte-tech/jean2/main/tools/repositoryv2.json';

const REPOSITORY_TIMEOUT = 10000;
const VERSION_TIMEOUT = 5000;

function getRegistryUrl(): string {
  return process.env.JEAN2_TOOL_REGISTRY_URL || DEFAULT_REGISTRY_URL;
}

export async function fetchRepository(): Promise<ToolRepository> {
  const url = getRegistryUrl();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REPOSITORY_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch tool repository: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json() as ToolRepository;
  validateRepository(data);
  return data;
}

async function fetchToolVersion(registry: RegistryConfig, name: string): Promise<string> {
  const url = registry.versionUrlTemplate.replace('{name}', name);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(VERSION_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch version for ${name}: ${response.status}`);
  }

  return (await response.text()).trim();
}

export function resolvePackage(
  entry: ToolCatalogEntry,
  availableRuntimes: Set<string>,
  platform: NodeJS.Platform = process.platform,
): PackageResolution {
  if (!entry.packages || entry.packages.length === 0) {
    const legacyPkg: ToolPackageDef = {
      name: '<legacy>',
      runtime: entry.runtime ?? 'bun',
      requiredRuntimes: entry.requiredRuntimes,
      postInstall: entry.postInstall,
    };
    return { pkg: legacyPkg, warnings: [] };
  }

  const warnings: string[] = [];

  const platformMatched = entry.packages.filter((pkg) => {
    if (!pkg.platforms || pkg.platforms.length === 0) return true;
    return pkg.platforms.includes(platform as string);
  });

  if (platformMatched.length === 0) {
    return {
      pkg: entry.packages[0],
      warnings: [],
      error: `No package available for platform "${platform}"`,
    };
  }

  const runtimeMatched = platformMatched.filter((pkg) => {
    const required = pkg.requiredRuntimes ?? entry.requiredRuntimes ?? [];
    return required.every((rt) => availableRuntimes.has(rt));
  });

  if (runtimeMatched.length > 0) {
    return { pkg: runtimeMatched[0], warnings };
  }

  const fallback = platformMatched[0];
  const missingRuntimes = (fallback.requiredRuntimes ?? entry.requiredRuntimes ?? [])
    .filter((rt) => !availableRuntimes.has(rt));

  warnings.push(
    `Required runtime(s) not found: ${missingRuntimes.join(', ')}. ` +
    `Falling back to "${fallback.name}" — you may need to install ${missingRuntimes.join(', ')} manually.`,
  );

  return { pkg: fallback, warnings };
}

export function resolveSpecificPackage(
  entry: ToolCatalogEntry,
  packageName: string,
): PackageResolution | null {
  if (!entry.packages || entry.packages.length === 0) {
    return null;
  }

  const pkg = entry.packages.find((p) => p.name === packageName);
  if (!pkg) {
    return null;
  }

  return { pkg, warnings: [] };
}

export async function fetchRepositoryWithVersions(options?: {
  availableRuntimes?: Set<string>;
  installedPackages?: Map<string, string>;
}): Promise<{
  registry: RegistryConfig;
  tools: ResolvedToolEntry[];
  extensions: Record<string, ExtensionDef>;
  envConfig: Record<string, EnvVarDef>;
}> {
  const availableRuntimes = options?.availableRuntimes ?? new Set();
  const installedPackages = options?.installedPackages;
  const repo = await fetchRepository();
  const toolNames = Object.keys(repo.tools);

  type ToolResolveState = {
    name: string;
    entry: ToolCatalogEntry;
    resolution: PackageResolution;
  };

  const resolvedStates: ToolResolveState[] = [];
  for (const name of toolNames) {
    const entry = repo.tools[name];
    const pinnedPkgName = installedPackages?.get(name);
    let resolution: PackageResolution;

    if (pinnedPkgName) {
      const pinned = resolveSpecificPackage(entry, pinnedPkgName);
      if (pinned) {
        resolution = pinned;
      } else {
        const fallback = resolvePackage(entry, availableRuntimes);
        fallback.warnings.push(
          `Installed package "${pinnedPkgName}" not found in registry, falling back to "${fallback.pkg.name}".`,
        );
        resolution = fallback;
      }
    } else {
      resolution = resolvePackage(entry, availableRuntimes);
    }

    resolvedStates.push({ name, entry, resolution });
  }

  const packageNameToToolNames = new Map<string, string[]>();
  for (const state of resolvedStates) {
    const pkgName = state.resolution.pkg.name;
    const existing = packageNameToToolNames.get(pkgName) ?? [];
    existing.push(state.name);
    packageNameToToolNames.set(pkgName, existing);
  }

  const versionResults = await Promise.allSettled(
    Array.from(packageNameToToolNames.keys()).map((pkgName) =>
      fetchToolVersion(repo.registry, pkgName),
    ),
  );

  const pkgNameList = Array.from(packageNameToToolNames.keys());
  const pkgVersionMap = new Map<string, string>();
  for (let i = 0; i < pkgNameList.length; i++) {
    const result = versionResults[i];
    const version = result.status === 'fulfilled' ? result.value : 'unknown';
    pkgVersionMap.set(pkgNameList[i], version);
  }

  const tools: ResolvedToolEntry[] = [];

  for (const state of resolvedStates) {
    const { name, entry, resolution } = state;
    const pkg = resolution.pkg;
    const pkgName = pkg.name;
    const version = pkgVersionMap.get(pkgName) ?? 'unknown';

    const runtime = pkg.runtime ?? entry.runtime ?? 'bun';
    const requiredRuntimes = pkg.requiredRuntimes ?? entry.requiredRuntimes ?? [];
    const postInstall = pkg.postInstall ?? entry.postInstall ?? null;
    const platforms = pkg.platforms ?? [];

    tools.push({
      name,
      packageName: pkgName,
      version,
      description: entry.description,
      runtime,
      requiredRuntimes,
      postInstall,
      extensions: entry.extensions,
      tags: entry.tags,
      dangerous: entry.dangerous,
      platforms,
    });
  }

  return {
    registry: repo.registry,
    tools,
    extensions: repo.extensions,
    envConfig: repo.envConfig ?? {},
  };
}

export function resolveDownloadUrl(
  registry: RegistryConfig,
  name: string,
  version: string,
  toolName?: string,
): string {
  return registry.urlTemplate
    .replaceAll('{baseUrl}', registry.baseUrl)
    .replaceAll('{name}', name)
    .replaceAll('{version}', version)
    .replaceAll('{toolName}', toolName ?? name);
}

export function getRecommendedToolNames(repo: ToolRepository): string[] {
  return Object.entries(repo.tools)
    .filter(([, entry]) => entry.tags.includes('recommended'))
    .map(([name]) => name);
}

export function collectRequiredRuntimes(tools: ResolvedToolEntry[]): string[] {
  const runtimes = new Set<string>();
  for (const tool of tools) {
    for (const rt of tool.requiredRuntimes) {
      runtimes.add(rt);
    }
  }
  return Array.from(runtimes);
}

export function getRequiredExtensions(
  tools: ResolvedToolEntry[],
  extensions: Record<string, ExtensionDef>,
): ExtensionDef[] {
  const toolNames = new Set(tools.map((t) => t.name));
  return Object.values(extensions).filter((ext) =>
    ext.requiredFor.some((name) => toolNames.has(name)),
  );
}

export function getOptionalExtensions(
  tools: ResolvedToolEntry[],
  extensions: Record<string, ExtensionDef>,
): ExtensionDef[] {
  const toolNames = new Set(tools.map((t) => t.name));
  return Object.values(extensions).filter((ext) =>
    !ext.requiredFor.some((name) => toolNames.has(name)) &&
    ext.optionalFor.some((name) => toolNames.has(name)),
  );
}

export function collectEnvVars(
  tools: ResolvedToolEntry[],
  extensions: Record<string, ExtensionDef>,
  topEnvConfig: Record<string, EnvVarDef>,
): Array<{ key: string; def: EnvVarDef; source: string }> {
  const toolNames = new Set(tools.map((t) => t.name));
  const result: Array<{ key: string; def: EnvVarDef; source: string }> = [];
  const seen = new Set<string>();

  for (const [id, ext] of Object.entries(extensions)) {
    if (!ext.envConfig) continue;
    const isRelevant = [...ext.requiredFor, ...ext.optionalFor]
      .some((name) => toolNames.has(name));
    if (!isRelevant) continue;

    for (const [key, def] of Object.entries(ext.envConfig)) {
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, def, source: `extension:${id}` });
      }
    }
  }

  for (const [key, def] of Object.entries(topEnvConfig)) {
    if (!def.usedBy) continue;
    if (!def.usedBy.some((name) => toolNames.has(name))) continue;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ key, def, source: 'global' });
    }
  }

  return result;
}

function validateRepository(data: ToolRepository): void {
  if (!data.registry?.baseUrl || !data.registry?.urlTemplate || !data.registry?.versionUrlTemplate) {
    throw new Error('Invalid tool repository: missing registry config');
  }
  if (!data.tools || typeof data.tools !== 'object') {
    throw new Error('Invalid tool repository: missing tools');
  }
  for (const [name, entry] of Object.entries(data.tools)) {
    if (entry.packages && entry.packages.length > 0) {
      for (const pkg of entry.packages) {
        if (!pkg.name) {
          throw new Error(`Invalid tool repository: package in "${name}" missing name`);
        }
        if (!pkg.runtime) {
          throw new Error(`Invalid tool repository: package "${pkg.name}" in "${name}" missing runtime`);
        }
      }
    } else if (!entry.runtime) {
      throw new Error(`Invalid tool repository: tool "${name}" missing runtime and no packages`);
    }
  }
}
