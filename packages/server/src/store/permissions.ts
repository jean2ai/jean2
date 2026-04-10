import { getDatabase } from './index';
import type { ToolPermission, PermissionType } from '@jean2/sdk';

interface ToolPermissionRow {
  id: string;
  workspace_id: string;
  tool_name: string;
  permission_type: string;
  permission_key: string;
  allowed: number;
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  metadata: string | null;
}

export function checkCachedPermission(
  workspaceId: string,
  toolName: string,
  permissionType: PermissionType,
  permissionKey: string
): { allowed: boolean; permission: ToolPermission } | null {
  const db = getDatabase();
  const row = db.query(`
    SELECT * FROM tool_permissions
    WHERE workspace_id = ? AND tool_name = ? AND permission_type = ?
      AND permission_key = ? AND allowed = 1 AND revoked_at IS NULL
    LIMIT 1
  `).get(workspaceId, toolName, permissionType, permissionKey) as ToolPermissionRow | undefined;

  if (!row) return null;
  return { allowed: true, permission: mapRowToToolPermission(row) };
}

export function grantPermission(permission: Omit<ToolPermission, 'id' | 'grantedAt' | 'revokedAt' | 'revokedBy'>): ToolPermission {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const p: ToolPermission = {
    id,
    ...permission,
    grantedAt: now,
    revokedAt: null,
    revokedBy: null,
  };

  db.run(`
    INSERT INTO tool_permissions
    (id, workspace_id, tool_name, permission_type, permission_key, allowed, granted_at, granted_by, revoked_at, revoked_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    p.id,
    p.workspaceId,
    p.toolName,
    p.permissionType,
    p.permissionKey,
    p.allowed ? 1 : 0,
    p.grantedAt,
    p.grantedBy,
    p.revokedAt,
    p.revokedBy,
    p.metadata ? JSON.stringify(p.metadata) : null,
  ]);

  return p;
}

export function revokePermission(id: string, revokedBy: string | null): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.run(`
    UPDATE tool_permissions SET revoked_at = ?, revoked_by = ? WHERE id = ?
  `, [now, revokedBy, id]);
}

export function getWorkspacePermissions(workspaceId: string, includeRevoked = false): ToolPermission[] {
  const db = getDatabase();
  const query = includeRevoked
    ? 'SELECT * FROM tool_permissions WHERE workspace_id = ? ORDER BY granted_at DESC'
    : 'SELECT * FROM tool_permissions WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY granted_at DESC';
  const rows = db.query(query).all(workspaceId) as ToolPermissionRow[];
  return rows.map(mapRowToToolPermission);
}

export function getWorkspacePermissionsHistory(workspaceId: string, limit = 100): ToolPermission[] {
  const db = getDatabase();
  const rows = db.query(`
    SELECT * FROM tool_permissions WHERE workspace_id = ?
    ORDER BY granted_at DESC LIMIT ?
  `).all(workspaceId, limit) as ToolPermissionRow[];
  return rows.map(mapRowToToolPermission);
}

export function revokeAllWorkspacePermissions(workspaceId: string, revokedBy: string | null): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.run(`
    UPDATE tool_permissions SET revoked_at = ?, revoked_by = ?
    WHERE workspace_id = ? AND revoked_at IS NULL
  `, [now, revokedBy, workspaceId]);
  return result.changes;
}

function mapRowToToolPermission(row: ToolPermissionRow): ToolPermission {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    toolName: row.tool_name,
    permissionType: row.permission_type as PermissionType,
    permissionKey: row.permission_key,
    allowed: row.allowed === 1,
    grantedAt: row.granted_at,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}
