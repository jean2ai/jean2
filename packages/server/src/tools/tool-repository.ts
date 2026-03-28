import type { ToolRuntime } from '@jean2/shared';

/**
 * Tool Repository Manager
 * 
 * Handles fetching the remote tool catalog, resolving versions from VERSION files,
 * and providing helpers for extension/env var queries.
 */

export interface RegistryConfig {
  baseUrl: string;
  urlTemplate: string;
  versionUrlTemplate: string;
}

export interface ToolCatalogEntry {
  description: string;
  runtime: ToolRuntime;
  requiredRuntimes: string[];
  postInstall: string | null;
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
  version: string;
  description: string;
  runtime: ToolRuntime;
  requiredRuntimes: string[];
  postInstall: string | null;
  extensions: string[];
  tags: string[];
  dangerous: boolean;
}

export interface ToolRepository {
  version: number;
  registry: RegistryConfig;
  tools: Record<string, ToolCatalogEntry>;
  extensions: Record<string, ExtensionDef>;
  envConfig?: Record<string, EnvVarDef>;
}

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/rabbyte-tech/jean2/main/tools/repository.json';

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

export async function fetchRepositoryWithVersions(): Promise<{
  registry: RegistryConfig;
  tools: ResolvedToolEntry[];
  extensions: Record<string, ExtensionDef>;
  envConfig: Record<string, EnvVarDef>;
}> {
  const repo = await fetchRepository();
  const toolNames = Object.keys(repo.tools);

  const versionResults = await Promise.allSettled(
    toolNames.map((name) => fetchToolVersion(repo.registry, name)),
  );

  const tools: ResolvedToolEntry[] = [];

  for (let i = 0; i < toolNames.length; i++) {
    const name = toolNames[i];
    const entry = repo.tools[name];
    const versionResult = versionResults[i];

    const version = versionResult.status === 'fulfilled'
      ? versionResult.value
      : 'unknown';

    tools.push({
      name,
      version,
      description: entry.description,
      runtime: entry.runtime,
      requiredRuntimes: entry.requiredRuntimes,
      postInstall: entry.postInstall,
      extensions: entry.extensions,
      tags: entry.tags,
      dangerous: entry.dangerous,
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
): string {
  return registry.urlTemplate
    .replace('{baseUrl}', registry.baseUrl)
    .replace('{name}', name)
    .replace('{version}', version);
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
}
