import type { ToolEnvVarStatus } from '@jean2/sdk';

export interface ToolEnvVar {
  name: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface ToolRegistryConfig {
  baseUrl: string;
  urlTemplate: string;
  versionUrlTemplate: string;
}

export interface ToolCatalogEntry {
  name: string;
  description: string;
  envVars?: ToolEnvVar[];
  hasSecurity?: boolean;
}

export interface RepositoryTool {
  name: string;
  description: string;
  version: string;
  artifactUrl: string;
  envVars?: ToolEnvVar[];
  hasSecurity?: boolean;
}

export interface ToolRepository {
  version: 3;
  format: 'source';
  registry: ToolRegistryConfig;
  tools: ToolCatalogEntry[];
  envConfig?: Record<string, unknown>;
}

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/rabbyte-tech/jean2/main/tools/repositoryv3.json';
const REPOSITORY_TIMEOUT = 10000;

function getRegistryUrl(): string {
  return process.env.JEAN2_TOOL_REGISTRY_URL || DEFAULT_REGISTRY_URL;
}

class RepositorySchemaError extends Error {
  constructor(message: string) {
    super(`Invalid tool repository schema: ${message}`);
    this.name = 'RepositorySchemaError';
  }
}

function validateToolEnvVars(tool: Record<string, unknown>, idx: string): void {
  if (tool.envVars === undefined) {
    return;
  }

  if (!Array.isArray(tool.envVars)) {
    throw new RepositorySchemaError(`${idx}.envVars must be an array`);
  }

  for (let j = 0; j < tool.envVars.length; j++) {
    const env = tool.envVars[j] as Record<string, unknown>;
    const envIdx = `${idx}.envVars[${j}]`;

    if (typeof env.name !== 'string' || !env.name) {
      throw new RepositorySchemaError(`${envIdx}.name is required`);
    }
    if (env.required !== undefined && typeof env.required !== 'boolean') {
      throw new RepositorySchemaError(`${envIdx}.required must be a boolean`);
    }
    if (env.sensitive !== undefined && typeof env.sensitive !== 'boolean') {
      throw new RepositorySchemaError(`${envIdx}.sensitive must be a boolean`);
    }
  }
}

function validateRepositoryShape(data: unknown): ToolRepository {
  if (!data || typeof data !== 'object') {
    throw new RepositorySchemaError('expected a JSON object');
  }

  const repo = data as Record<string, unknown>;

  if (repo.version !== 3) {
    throw new RepositorySchemaError(`expected version 3, got ${repo.version}`);
  }

  if (repo.format !== 'source') {
    throw new RepositorySchemaError(
      `expected format "source", got "${repo.format}"`,
    );
  }

  if (!repo.registry || typeof repo.registry !== 'object') {
    throw new RepositorySchemaError('registry is required');
  }

  const registry = repo.registry as Record<string, unknown>;
  if (typeof registry.baseUrl !== 'string' || !registry.baseUrl) {
    throw new RepositorySchemaError('registry.baseUrl is required');
  }
  if (typeof registry.urlTemplate !== 'string' || !registry.urlTemplate) {
    throw new RepositorySchemaError('registry.urlTemplate is required');
  }
  if (typeof registry.versionUrlTemplate !== 'string' || !registry.versionUrlTemplate) {
    throw new RepositorySchemaError('registry.versionUrlTemplate is required');
  }

  if (!Array.isArray(repo.tools)) {
    throw new RepositorySchemaError('tools must be an array');
  }

  for (let i = 0; i < repo.tools.length; i++) {
    const tool = repo.tools[i] as Record<string, unknown>;
    const idx = `tools[${i}]`;

    if (typeof tool.name !== 'string' || !tool.name) {
      throw new RepositorySchemaError(`${idx}.name is required`);
    }
    if (typeof tool.description !== 'string' || !tool.description) {
      throw new RepositorySchemaError(`${idx}.description is required`);
    }
    if (tool.hasSecurity !== undefined && typeof tool.hasSecurity !== 'boolean') {
      throw new RepositorySchemaError(`${idx}.hasSecurity must be a boolean`);
    }

    validateToolEnvVars(tool, idx);
  }

  return data as ToolRepository;
}

function applyTemplate(template: string, values: Record<string, string>): string {
  let resolved = template;

  for (const [key, value] of Object.entries(values)) {
    resolved = resolved.replaceAll(`{${key}}`, value);
  }

  return resolved;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REPOSITORY_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchToolVersion(
  registry: ToolRegistryConfig,
  toolName: string,
): Promise<string> {
  const versionUrl = applyTemplate(registry.versionUrlTemplate, {
    baseUrl: registry.baseUrl,
    name: toolName,
    version: '',
  });

  const version = (await fetchText(versionUrl)).trim();
  if (!version) {
    throw new Error(`Empty version for tool ${toolName}`);
  }

  return version;
}

function resolveArtifactUrl(
  registry: ToolRegistryConfig,
  toolName: string,
  version: string,
): string {
  return applyTemplate(registry.urlTemplate, {
    baseUrl: registry.baseUrl,
    name: toolName,
    version,
  });
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

  const data = await response.json();
  return validateRepositoryShape(data);
}

export async function fetchRepositoryWithVersions(): Promise<RepositoryTool[]> {
  const repo = await fetchRepository();

  return Promise.all(
    repo.tools.map(async (tool) => {
      const version = await fetchToolVersion(repo.registry, tool.name);
      const artifactUrl = resolveArtifactUrl(repo.registry, tool.name, version);

      return {
        name: tool.name,
        description: tool.description,
        version,
        artifactUrl,
        envVars: tool.envVars,
        hasSecurity: tool.hasSecurity,
      } satisfies RepositoryTool;
    }),
  );
}

export async function collectEnvVars(toolName: string): Promise<ToolEnvVarStatus[]> {
  const repo = await fetchRepository();
  const tool = repo.tools.find((t) => t.name === toolName);

  if (!tool?.envVars) {
    return [];
  }

  return tool.envVars.map((env) => ({
    key: env.name,
    configured: false,
    sensitive: env.sensitive ?? false,
  }));
}

export async function getToolByName(toolName: string): Promise<RepositoryTool | null> {
  const tools = await fetchRepositoryWithVersions();
  return tools.find((t) => t.name === toolName) ?? null;
}
