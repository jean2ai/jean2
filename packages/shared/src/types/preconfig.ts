export type PreconfigMode = 'primary' | 'subagent' | 'both';

export interface Preconfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | null;
  model: string | null;
  provider: string | null;
  settings: Record<string, unknown> | null;
  isDefault: boolean;
  mode?: PreconfigMode; // Default: 'primary'
  canSpawnSubagents?: boolean; // Default: true (except for read-only agents)
}
