import { getDatabase } from './index';
import type { 
  PermissionGrant, 
  PermissionGrantOptions, 
  GrantScope, 
  GrantMatcher,
  PermissionResource,
} from '@jean2/sdk';

// =============================================================================
// Canonical Permission Contract - Server Implementation
// 
// This module implements the canonical permission contract:
// - GrantScope: once/session/workspace/always
// - GrantMatcher: exact/prefix/glob/shell-command
// - PermissionResource: file/path/shell-command/network/etc.
// - "once" grants are NOT persisted (one-time use only)
// =============================================================================

// =============================================================================
// Pattern Matching
// =============================================================================

function matchShellCommand(pattern: string, command: string): boolean {
  const cmdLower = command.toLowerCase();
  const patternLower = pattern.toLowerCase();
  
  if (patternLower === cmdLower) return true;
  if (patternLower.endsWith('*') && cmdLower.startsWith(patternLower.slice(0, -1))) return true;
  if (patternLower.startsWith('*') && cmdLower.endsWith(patternLower.slice(1))) return true;
  
  return false;
}

function matchPattern(pattern: string, requestKey: string, matcher: GrantMatcher): boolean {
  switch (matcher) {
    case 'exact':
      return pattern === requestKey;
    case 'prefix':
      return requestKey.startsWith(pattern);
    case 'glob':
      return globMatch(pattern, requestKey);
    case 'shell-command':
      return matchShellCommand(pattern, requestKey);
    default:
      return false;
  }
}

function globMatch(pattern: string, text: string): boolean {
  const parts = pattern.split('*');
  if (parts.length === 1) {
    return pattern === text;
  }
  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0 && pattern.startsWith('*')) continue;
    if (i === parts.length - 1 && pattern.endsWith('*')) continue;
    const found = text.indexOf(part, idx);
    if (found === -1) return false;
    idx = found + part.length;
  }
  return true;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface PermissionGrantRow {
  id: string;
  workspace_id: string;
  tool_name: string;
  resource: string;
  scope: string;
  matcher: string;
  pattern: string;
  allowed: number;
  granted_at: string;
  expires_at: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  metadata: string | null;
}

// =============================================================================
// Grant Management Functions
// =============================================================================

/**
 * Get all grants for a workspace
 */
export function getWorkspaceGrants(
  workspaceId: string,
  options?: { includeRevoked?: boolean }
): PermissionGrant[] {
  const db = getDatabase();
  const query = options?.includeRevoked
    ? 'SELECT * FROM permission_grants WHERE workspace_id = ? ORDER BY granted_at DESC'
    : 'SELECT * FROM permission_grants WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY granted_at DESC';
  const rows = db.query(query).all(workspaceId) as PermissionGrantRow[];
  return rows.map(mapRowToGrant);
}

/**
 * Match a permission request against stored grants
 * Returns the first matching grant if found
 */
export function matchGrant(params: {
  workspaceId: string;
  toolName: string;
  resource: PermissionResource;
  permissionKey: string;
}): { matched: boolean; grant: PermissionGrant | null } {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const rows = db.query(`
    SELECT * FROM permission_grants
    WHERE workspace_id = ? AND tool_name = ? AND resource = ?
      AND revoked_at IS NULL AND allowed = 1
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY granted_at DESC
  `).all(params.workspaceId, params.toolName, params.resource, now) as PermissionGrantRow[];

  for (const row of rows) {
    // Parse JSON patterns and match each individually
    const patterns: string[] = JSON.parse(row.pattern || '[]');
    const matches = patterns.some(p =>
      matchPattern(p, params.permissionKey, row.matcher as GrantMatcher)
    );
    if (matches) {
      return { matched: true, grant: mapRowToGrant(row) };
    }
  }
  return { matched: false, grant: null };
}

/**
 * Create a new grant from options
 * NOTE: "once" scope grants are NOT persisted - they're returned for immediate use only
 */
export function createGrantFromOptions(
  params: {
    workspaceId: string;
    toolName: string;
    resource: PermissionResource;
    permissionKey: string;
  } & { grantOptions: PermissionGrantOptions }
): PermissionGrant | null {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { grantOptions, ...matchParams } = params;

  // "once" scope = one-time use, NOT persisted
  if (grantOptions.scope === 'once') {
    return {
      id,
      workspaceId: matchParams.workspaceId,
      toolName: matchParams.toolName,
      resource: matchParams.resource,
      scope: 'once',
      matcher: grantOptions.matcher || 'exact',
      patterns: grantOptions.patterns || [matchParams.permissionKey],
      allowed: true,
      grantedAt: now,
      expiresAt: null, // Never expires - it's one use only
      grantedBy: null,
      revokedAt: null,
      revokedBy: null,
      metadata: grantOptions.description ? { description: grantOptions.description } : null,
    };
  }

  // Compute expiration for session scope
  let expiresAt: string | null = null;
  if (grantOptions.scope === 'session' && grantOptions.duration && grantOptions.duration > 0) {
    expiresAt = new Date(Date.now() + grantOptions.duration).toISOString();
  }

  const grant: PermissionGrant = {
    id,
    workspaceId: matchParams.workspaceId,
    toolName: matchParams.toolName,
    resource: matchParams.resource,
    scope: grantOptions.scope || 'workspace',
    matcher: grantOptions.matcher || 'exact',
    patterns: grantOptions.patterns || [matchParams.permissionKey],
    allowed: true,
    grantedAt: now,
    expiresAt,
    grantedBy: null,
    revokedAt: null,
    revokedBy: null,
    metadata: grantOptions.description ? { description: grantOptions.description } : null,
  };

  db.run(
    `INSERT INTO permission_grants (
      id, workspace_id, tool_name, resource, scope, matcher, pattern, 
      allowed, granted_at, expires_at, granted_by, revoked_at, revoked_by, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      grant.id,
      grant.workspaceId,
      grant.toolName,
      grant.resource,
      grant.scope,
      grant.matcher,
      JSON.stringify(grant.patterns), // Store patterns as JSON to avoid comma-separation issues
      grant.allowed ? 1 : 0,
      grant.grantedAt,
      grant.expiresAt,
      grant.grantedBy,
      grant.revokedAt,
      grant.revokedBy,
      grant.metadata ? JSON.stringify(grant.metadata) : null,
    ],
  );

  return grant;
}

/**
 * Revoke a specific grant
 */
export function revokeGrant(id: string, revokedBy?: string | null): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.run(
    'UPDATE permission_grants SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL',
    [now, revokedBy ?? null, id],
  );
  return result.changes > 0;
}

/**
 * Revoke all grants for a workspace
 */
export function revokeAllWorkspaceGrants(
  workspaceId: string,
  revokedBy?: string | null,
): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.run(
    'UPDATE permission_grants SET revoked_at = ?, revoked_by = ? WHERE workspace_id = ? AND revoked_at IS NULL',
    [now, revokedBy ?? null, workspaceId],
  );
  return result.changes;
}

// =============================================================================
// Legacy Permission Functions (backward compatibility)
// =============================================================================

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
  permissionType: string,
  permissionKey: string
): { allowed: boolean; permission: ToolPermissionRow } | null {
  const db = getDatabase();
  const row = db.query(`
    SELECT * FROM tool_permissions
    WHERE workspace_id = ? AND tool_name = ? AND permission_type = ?
      AND permission_key = ? AND allowed = 1 AND revoked_at IS NULL
    LIMIT 1
  `).get(workspaceId, toolName, permissionType, permissionKey) as ToolPermissionRow | undefined;

  if (!row) return null;
  return { allowed: true, permission: row };
}

export interface GrantPermissionParams {
  workspaceId: string;
  toolName: string;
  permissionType: string;
  permissionKey: string;
  allowed: boolean;
  grantedBy: string | null;
  metadata?: Record<string, unknown>;
}

export function grantPermission(params: GrantPermissionParams): ToolPermissionRow {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(`
    INSERT INTO tool_permissions
    (id, workspace_id, tool_name, permission_type, permission_key, allowed, granted_at, granted_by, revoked_at, revoked_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    params.workspaceId,
    params.toolName,
    params.permissionType,
    params.permissionKey,
    params.allowed ? 1 : 0,
    now,
    params.grantedBy,
    null,
    null,
    params.metadata ? JSON.stringify(params.metadata) : null,
  ]);

  return {
    id,
    workspace_id: params.workspaceId,
    tool_name: params.toolName,
    permission_type: params.permissionType,
    permission_key: params.permissionKey,
    allowed: params.allowed ? 1 : 0,
    granted_at: now,
    granted_by: params.grantedBy,
    revoked_at: null,
    revoked_by: null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  };
}

export function revokePermission(id: string, revokedBy: string | null): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.run(`
    UPDATE tool_permissions SET revoked_at = ?, revoked_by = ? WHERE id = ?
  `, [now, revokedBy, id]);
}

export function getWorkspacePermissions(workspaceId: string, includeRevoked = false): ToolPermissionRow[] {
  const db = getDatabase();
  const query = includeRevoked
    ? 'SELECT * FROM tool_permissions WHERE workspace_id = ? ORDER BY granted_at DESC'
    : 'SELECT * FROM tool_permissions WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY granted_at DESC';
  const rows = db.query(query).all(workspaceId) as ToolPermissionRow[];
  return rows;
}

export function getWorkspacePermissionsHistory(workspaceId: string, limit = 100): ToolPermissionRow[] {
  const db = getDatabase();
  const rows = db.query(`
    SELECT * FROM tool_permissions WHERE workspace_id = ?
    ORDER BY granted_at DESC LIMIT ?
  `).all(workspaceId, limit) as ToolPermissionRow[];
  return rows;
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

// =============================================================================
// Row Mapping
// =============================================================================

function mapRowToGrant(row: PermissionGrantRow): PermissionGrant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    toolName: row.tool_name,
    resource: row.resource as PermissionResource,
    scope: row.scope as GrantScope,
    matcher: row.matcher as GrantMatcher,
    patterns: JSON.parse(row.pattern || '[]'),
    allowed: row.allowed === 1,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}
