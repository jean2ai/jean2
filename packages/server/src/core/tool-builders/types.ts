import type { Tool } from 'ai';

export interface ToolBuildContext {
  sessionId: string;
  workspaceId: string | undefined;
  workspacePath: string | undefined;
  rootSessionId: string;
  modelId?: string;
  providerId?: string;
  broadcastFn?: import('@/tools/ask-user-api').AskBroadcastFn;
  additionalPaths?: string[];
  agentId?: string | null;
}

export type ToolMap = Record<string, Tool>;
