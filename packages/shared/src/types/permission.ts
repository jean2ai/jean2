export type PermissionType = 'tool' | 'action';

export type PermissionKey = string;

export interface SecurityCheckInput {
  args: Record<string, unknown>;
  workspacePath: string;
  sessionId: string;
  allowedPaths?: string[];
}

export interface SecurityCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: PermissionType;
  permissionKey: PermissionKey;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolPermission {
  id: string;
  workspaceId: string;
  toolName: string;
  permissionType: PermissionType;
  permissionKey: PermissionKey;
  allowed: boolean;
  grantedAt: string;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PermissionRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: PermissionKey;
  message: string;
  details?: Record<string, unknown>;
}

export interface PermissionResponse {
  toolCallId: string;
  allowed: boolean;
  alwaysAllow: boolean;
}
