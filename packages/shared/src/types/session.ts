export type SessionStatus = 'active' | 'closed';

export type SubagentStatus = 'running' | 'completed' | 'error';

export interface Session {
  id: string;
  workspaceId: string;  // FK to workspace
  preconfigId: string | null;
  title: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  selectedModel?: string | null;
  selectedProvider?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  parentId: string | null;    // ID of parent session (null for top-level)
  agentName: string | null;   // Name of the agent/preconfig running this session
  subagentStatus?: SubagentStatus | null;  // Status for subagent sessions only
  runningAt?: string | null;  // ISO timestamp when session started running, null when not running
}
