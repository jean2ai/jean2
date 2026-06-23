import type { PermissionRiskLevel } from './permission';

export interface WorkspaceMemorySettings {
  enabled: boolean;
  permissionRisk: PermissionRiskLevel;
}

export interface WorkspaceSkillSettings {
  managementEnabled: boolean;
  permissionRisk: PermissionRiskLevel;
}

export interface WorkspaceSessionSearchSettings {
  enabled: boolean;
  permissionRisk: PermissionRiskLevel;
  includeToolResults: boolean;
}

export interface WorkspaceWorkflowSettings {
  enabled: boolean;
}

export interface WorkspaceSettings {
  memory?: WorkspaceMemorySettings;
  skills?: WorkspaceSkillSettings;
  sessionSearch?: WorkspaceSessionSearchSettings;
  workflow?: WorkspaceWorkflowSettings;
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
