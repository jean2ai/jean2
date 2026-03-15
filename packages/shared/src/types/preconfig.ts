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
  /**
   * Controls which skills this preconfig can access.
   * - undefined or null: All available skills (default for backward compatibility)
   * - []: No skills available
   * - ["skill-name", ...]: Only these named skills available
   */
  skills?: string[] | null;
}
