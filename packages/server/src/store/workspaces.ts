import { getDatabase } from './index';
import type { Workspace } from '@jean2/sdk';

// Interface for raw database row from workspaces table
interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  is_virtual: number;
  created_at: string;
  updated_at: string;
}

// Input type for creating workspace
export interface CreateWorkspaceInput {
  id: string;
  name: string;
  path: string;
  isVirtual: boolean;
}

function mapRowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    isVirtual: row.is_virtual === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const workspace: Workspace = {
    id: input.id,
    name: input.name,
    path: input.path,
    isVirtual: input.isVirtual,
    createdAt: now,
    updatedAt: now,
  };
  
  db.run(`
    INSERT INTO workspaces (id, name, path, is_virtual, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    workspace.id,
    workspace.name,
    workspace.path,
    workspace.isVirtual ? 1 : 0,
    workspace.createdAt,
    workspace.updatedAt,
  ]);
  
  return workspace;
}

export function getWorkspace(id: string): Workspace | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
  if (!row) return null;
  return mapRowToWorkspace(row);
}

export function listWorkspaces(): Workspace[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM workspaces ORDER BY created_at DESC').all() as WorkspaceRow[];
  return rows.map(mapRowToWorkspace);
}

export function updateWorkspace(id: string, updates: { name: string }): Workspace | null {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?
  `, [updates.name, now, id]);
  
  return getWorkspace(id);
}

export function deleteWorkspace(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM workspaces WHERE id = ?', [id]);
  return result.changes > 0;
}

export function countSessionsInWorkspace(workspaceId: string): number {
  const db = getDatabase();
  const result = db.query('SELECT COUNT(*) as count FROM sessions WHERE workspace_id = ?').get(workspaceId) as { count: number };
  return result.count;
}
