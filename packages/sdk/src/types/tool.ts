export type ToolRuntime = 'bun' | 'node' | 'python' | 'bash' | 'go' | 'binary' | 'powershell';

export interface ToolDefinition {
  name: string;
  description: string;
  script: string;
  runtime: ToolRuntime;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  timeout: number;
  requireApproval: boolean;
  dangerous: boolean;
  env?: string[];
  hasSecurityCheck?: boolean;
  securityScript?: string;
  securityTimeout?: number;
}

export interface ToolExecutionContext {
  workspacePath?: string;
  sessionId: string;
  workspaceId?: string;
  allowedPaths?: string[];
}

export interface ToolExecution {
  id: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type ToolApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout';

export interface ToolApproval {
  id: string;
  sessionId: string;
  childSessionId?: string;
  subagentName?: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType?: string;
  permissionKey?: string;
  message?: string;
  details?: Record<string, unknown>;
  status: ToolApprovalStatus;
  requestedAt: string;
  respondedAt?: string | null;
}