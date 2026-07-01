import type { PreconfigMode } from './preconfig';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | null;
  model: string | null;
  provider: string | null;
  variant?: string | null;
  settings: Record<string, unknown> | null;
  isDefault: boolean;
  mode?: PreconfigMode;
  canSpawnSubagents?: boolean | string[] | null;
  skills?: string[] | null;
  hasHome: boolean;
  createdAt: string;
}
