import type { PermissionRiskLevel } from './permission';

export interface WorkspaceMemorySettings {
  enabled: boolean;
  permissionRisk: PermissionRiskLevel;
}

export interface WorkspaceSettings {
  memory?: WorkspaceMemorySettings;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  isVirtual: boolean;
  additionalPaths: string[];
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}
