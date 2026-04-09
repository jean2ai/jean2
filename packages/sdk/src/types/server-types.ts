/**
 * Server-specific types that are shared between server and SDK consumers
 */

// =============================================================================
// Tool Execution Types
// =============================================================================

export interface ToolExecutionContext {
  workspacePath?: string;
  workspaceId?: string;
  sessionId: string;
  allowedPaths?: string[];
}

// =============================================================================
// Runtime Setup Types
// =============================================================================

export interface RuntimeMethod {
  name: string;
  command: string;
  notes?: string;
}

export interface PlatformRuntimeSetup {
  prereqNotes?: string;
  methods: RuntimeMethod[];
}

export interface RuntimeSetup {
  id: string;
  displayName: string;
  verifyCommand: string;
  docsUrl: string;
  platforms: {
    darwin?: PlatformRuntimeSetup;
    linux?: PlatformRuntimeSetup;
    win32?: PlatformRuntimeSetup;
  };
}

export interface RuntimeSetupResult {
  success: boolean;
  version?: string;
  error?: string;
}

// =============================================================================
// Tool Approval Types
// =============================================================================

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
  respondedAt?: string;
}

// =============================================================================
// Tool Execution Types
// =============================================================================

export interface ToolExecution {
  id: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string | null;
}

// =============================================================================
// Skill Types
// =============================================================================

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
  content: string;
  userInvocable?: boolean;
}

// =============================================================================
// Codex Provider Types
// =============================================================================

export interface CodexOAuthConfig {
  type: 'oauth';
  provider: 'codex';
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  connectedAt: string;
}

export type CodexProviderConfig = CodexOAuthConfig;
