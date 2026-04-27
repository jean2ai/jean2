import type { ToolEnvVarStatus } from '@jean2/sdk';

export interface ToolEnvVar {
  name: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface RepositoryTool {
  name: string;
  description: string;
  version: string;
  downloadUrl: string;
  envVars?: ToolEnvVar[];
  hasSecurity?: boolean;
}

export interface ToolRepository {
  tools: RepositoryTool[];
  lastUpdated: string;
}

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/rabbyte-tech/jean2/main/tools/repositoryv3.json';

const REPOSITORY_TIMEOUT = 10000;

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
  return data;
}

export async function fetchRepositoryWithVersions(): Promise<RepositoryTool[]> {
  const repo = await fetchRepository();
  return repo.tools;
}

export function resolveDownloadUrl(toolName: string, version: string): string {
  return `https://github.com/rabbyte-tech/jean2/releases/download/tool-${toolName}/v${version}/${toolName}.tar.gz`;
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
  const repo = await fetchRepository();
  return repo.tools.find((t) => t.name === toolName) ?? null;
}
