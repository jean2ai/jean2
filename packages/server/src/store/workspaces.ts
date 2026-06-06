import { getDatabase } from './index';
import type { Workspace } from '@jean2/sdk';

interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  is_virtual: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  id: string;
  name: string;
  path: string;
  isVirtual: boolean;
  additionalPaths?: string[];
}

function mapRowToWorkspace(row: WorkspaceRow): Workspace {
  const db = getDatabase();
  const pathRows = db.query(
    'SELECT path, label FROM workspace_paths WHERE workspace_id = ? ORDER BY rowid',
  ).all(row.id) as { path: string; label: string | null }[];

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    isVirtual: row.is_virtual === 1,
    additionalPaths: pathRows.map(r => r.path),
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
    additionalPaths: input.additionalPaths ?? [],
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

  for (const p of input.additionalPaths ?? []) {
    db.run(
      'INSERT OR IGNORE INTO workspace_paths (workspace_id, path) VALUES (?, ?)',
      [workspace.id, p],
    );
  }

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

export function updateWorkspace(
  id: string,
  updates: { name?: string; additionalPaths?: string[] },
): Workspace | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  if (updates.name !== undefined) {
    db.run('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?', [
      updates.name, now, id,
    ]);
  }

  if (updates.additionalPaths !== undefined) {
    db.run('DELETE FROM workspace_paths WHERE workspace_id = ?', [id]);
    for (const p of updates.additionalPaths) {
      db.run(
        'INSERT OR IGNORE INTO workspace_paths (workspace_id, path) VALUES (?, ?)',
        [id, p],
      );
    }
    db.run('UPDATE workspaces SET updated_at = ? WHERE id = ?', [now, id]);
  }

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
