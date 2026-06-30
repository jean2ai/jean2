import { getDatabase } from './index';
import type { Session, SessionStatus, SubagentStatus, Workspace } from '@jean2/sdk';
import { getWorkspace } from './workspaces';
import { deleteAttachmentsForSession, deleteAttachmentsForWorkspace } from './attachments';
import { rmSync, existsSync } from 'fs';
import os from 'node:os';
import path from 'node:path';

// Interface for raw database row from sessions table
interface SessionRow {
  id: string;
  preconfig_id: string | null;
  workspace_id: string | null;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  selected_model: string | null;
  selected_provider: string | null;
  selected_variant: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  parent_id: string | null;
  agent_name: string | null;
  subagent_status: string | null;
  running_at: string | null;
  compacting: number;
  tags: string;
  auto_approve_severity: string | null;
  agent_id: string | null;
}

export function createSession(session: Omit<Session, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): Session {
  const db = getDatabase();
  const now = new Date().toISOString();
  const s: Session = {
    ...session,
    tags: session.tags ?? [],
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
  };
  
  db.run(`
    INSERT INTO sessions (id, workspace_id, preconfig_id, title, status, created_at, updated_at, metadata, selected_model, selected_provider, selected_variant, prompt_tokens, completion_tokens, total_tokens, parent_id, agent_name, subagent_status, running_at, compacting, tags, auto_approve_severity, agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    s.id,
    s.workspaceId,
    s.preconfigId,
    s.title,
    s.status,
    s.createdAt,
    s.updatedAt,
    s.metadata ? JSON.stringify(s.metadata) : null,
    s.selectedModel ?? null,
    s.selectedProvider ?? null,
    s.selectedVariant ?? null,
    s.parentId ?? null,
    s.agentName ?? null,
    s.subagentStatus ?? null,
    s.runningAt ?? null,
    s.compacting ?? false,
    JSON.stringify(s.tags ?? []),
    s.autoApproveSeverity ?? null,
    s.agentId ?? null,
  ]);
  
  return s;
}

export function getSession(id: string): Session | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) return null;
  return mapRowToSession(row);
}

export function getSessionWithWorkspace(sessionId: string): { session: Session; workspace: Workspace | null } | null {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }
  
  const workspace = session.workspaceId ? getWorkspace(session.workspaceId) : null;
  return { session, workspace };
}

export function listSessions(status?: SessionStatus): Session[] {
  const db = getDatabase();
  const query = 'SELECT * FROM sessions ORDER BY updated_at DESC';
  
  if (status) {
    const rows = db.query('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC').all(status) as SessionRow[];
    return rows.map(mapRowToSession);
  }
  
  const rows = db.query(query).all() as SessionRow[];
  return rows.map(mapRowToSession);
}

export function updateSession(id: string, updates: Partial<Pick<Session, 'title' | 'status' | 'metadata' | 'preconfigId' | 'selectedModel' | 'selectedProvider' | 'selectedVariant' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'parentId' | 'agentName' | 'subagentStatus' | 'runningAt' | 'compacting' | 'tags' | 'autoApproveSeverity' | 'agentId'>>): Session | null {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const setClauses: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];
  
  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.metadata !== undefined) {
    setClauses.push('metadata = ?');
    values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
  }
  if (updates.preconfigId !== undefined) {
    setClauses.push('preconfig_id = ?');
    values.push(updates.preconfigId);
  }
  if (updates.selectedModel !== undefined) {
    setClauses.push('selected_model = ?');
    values.push(updates.selectedModel);
  }
  if (updates.selectedProvider !== undefined) {
    setClauses.push('selected_provider = ?');
    values.push(updates.selectedProvider);
  }
  if (updates.selectedVariant !== undefined) {
    setClauses.push('selected_variant = ?');
    values.push(updates.selectedVariant);
  }
  if (updates.promptTokens !== undefined) {
    setClauses.push('prompt_tokens = ?');
    values.push(updates.promptTokens);
  }
  if (updates.completionTokens !== undefined) {
    setClauses.push('completion_tokens = ?');
    values.push(updates.completionTokens);
  }
  if (updates.totalTokens !== undefined) {
    setClauses.push('total_tokens = ?');
    values.push(updates.totalTokens);
  }
  if (updates.parentId !== undefined) {
    setClauses.push('parent_id = ?');
    values.push(updates.parentId);
  }
  if (updates.agentName !== undefined) {
    setClauses.push('agent_name = ?');
    values.push(updates.agentName);
  }
  if (updates.subagentStatus !== undefined) {
    setClauses.push('subagent_status = ?');
    values.push(updates.subagentStatus);
  }
  if (updates.runningAt !== undefined) {
    setClauses.push('running_at = ?');
    values.push(updates.runningAt);
  }
  if (updates.compacting !== undefined) {
    setClauses.push('compacting = ?');
    values.push(updates.compacting ? 1 : 0);
  }
  if (updates.tags !== undefined) {
    setClauses.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.autoApproveSeverity !== undefined) {
    setClauses.push('auto_approve_severity = ?');
    values.push(updates.autoApproveSeverity ?? null);
  }
  if (updates.agentId !== undefined) {
    setClauses.push('agent_id = ?');
    values.push(updates.agentId ?? null);
  }
  
  values.push(id);
  
  db.run(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`, values as (string | number)[]);
  return getSession(id);
}

const OUTPUT_DIR_PREFIX = path.join(os.tmpdir(), 'jean2', '');

export function cleanupSessionOutputDir(sessionId: string): void {
  const dir = `${OUTPUT_DIR_PREFIX}${sessionId}`;
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[cleanup] Failed to remove output dir ${dir}:`, err);
    }
  }
}

export function cleanupWorkspaceSessionsOutputDirs(workspaceId: string): void {
  const sessions = listSessionsByWorkspace(workspaceId);
  for (const session of sessions) {
    cleanupSessionOutputDir(session.id);
  }
}

/**
 * Cleanup session output directories for a list of session IDs.
 * Used when deleting a workspace - the sessions may already be removed from DB,
 * so we clean up based on pre-collected session IDs.
 */
export function cleanupSessionsOutputDirs(sessionIds: string[]): void {
  for (const sessionId of sessionIds) {
    cleanupSessionOutputDir(sessionId);
  }
}

export function deleteSession(id: string): boolean {
  const db = getDatabase();

  deleteAttachmentsForSession(id);

  const result = db.run('DELETE FROM sessions WHERE id = ?', [id]);

  if (result.changes > 0) {
    cleanupSessionOutputDir(id);
  }

  return result.changes > 0;
}

export function deleteSessionsByWorkspace(workspaceId: string): void {
  const sessions = listSessionsByWorkspace(workspaceId);

  deleteAttachmentsForWorkspace(workspaceId);

  const db = getDatabase();
  db.run('DELETE FROM sessions WHERE workspace_id = ?', [workspaceId]);
  for (const session of sessions) {
    cleanupSessionOutputDir(session.id);
  }
}

export function listSessionsByWorkspace(
  workspaceId: string,
  options?: { status?: SessionStatus; rootOnly?: boolean }
): Session[] {
  const db = getDatabase();
  const whereClauses: string[] = ['workspace_id = ?'];
  const values: (string | number)[] = [workspaceId];

  if (options?.status !== undefined) {
    whereClauses.push('status = ?');
    values.push(options.status);
  }
  if (options?.rootOnly === true) {
    whereClauses.push('parent_id IS NULL');
  }

  const query = `SELECT * FROM sessions WHERE ${whereClauses.join(' AND ')} ORDER BY updated_at DESC`;
  const rows = db.query(query).all(...values) as SessionRow[];
  return rows.map(mapRowToSession);
}

export function listSessionsGrouped(
  workspaceIds: string[],
  options?: { status?: SessionStatus; rootOnly?: boolean }
): Record<string, Session[]> {
  const db = getDatabase();
  const placeholders = workspaceIds.map(() => '?').join(', ');
  const whereClauses: string[] = [`workspace_id IN (${placeholders})`];
  const values: (string | number)[] = [...workspaceIds];

  if (options?.status !== undefined) {
    whereClauses.push('status = ?');
    values.push(options.status);
  }
  if (options?.rootOnly === true) {
    whereClauses.push('parent_id IS NULL');
  }

  const query = `SELECT * FROM sessions WHERE ${whereClauses.join(' AND ')} ORDER BY updated_at DESC`;
  const rows = db.query(query).all(...values) as SessionRow[];

  const result: Record<string, Session[]> = {};
  for (const id of workspaceIds) {
    result[id] = [];
  }
  for (const row of rows) {
    const wsId = row.workspace_id || '';
    if (result[wsId]) {
      result[wsId].push(mapRowToSession(row));
    }
  }

  return result;
}

function mapRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    preconfigId: row.preconfig_id,
    workspaceId: row.workspace_id || '',
    title: row.title,
    status: row.status as SessionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    selectedModel: row.selected_model ?? null,
    selectedProvider: row.selected_provider ?? null,
    selectedVariant: row.selected_variant ?? null,
    promptTokens: row.prompt_tokens ?? undefined,
    completionTokens: row.completion_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    parentId: row.parent_id ?? null,
    agentName: row.agent_name ?? null,
    subagentStatus: row.subagent_status as SubagentStatus | null ?? null,
    runningAt: row.running_at ?? null,
    compacting: !!row.compacting,
    tags: row.tags ? JSON.parse(row.tags) : [],
    autoApproveSeverity: (row.auto_approve_severity as Session['autoApproveSeverity']) ?? null,
    agentId: row.agent_id ?? null,
  };
}

export function listTagsByWorkspace(workspaceId: string): string[] {
  const db = getDatabase();
  const rows = db.query(
    'SELECT DISTINCT tags FROM sessions WHERE workspace_id = ? AND tags != ?',
  ).all(workspaceId, '[]') as { tags: string }[];

  const tagSet = new Set<string>();
  for (const row of rows) {
    try {
      const tags: string[] = JSON.parse(row.tags);
      for (const tag of tags) {
        tagSet.add(tag);
      }
    } catch {
      // Skip malformed
    }
  }
  return Array.from(tagSet).sort();
}

export function getChildSessions(parentId: string): Session[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM sessions WHERE parent_id = ? ORDER BY created_at ASC').all(parentId) as SessionRow[];
  return rows.map(mapRowToSession);
}

export function getSessionsByAgent(agentId: string, sinceTimestamp?: number, limit?: number): Session[] {
  const db = getDatabase();
  const sinceIso = sinceTimestamp ? new Date(sinceTimestamp).toISOString() : undefined;
  const conditions = ['agent_id = ?', 'parent_id IS NULL'];
  const params: (string | number)[] = [agentId];
  if (sinceIso) {
    conditions.push('updated_at > ?');
    params.push(sinceIso);
  }
  const sql = `SELECT * FROM sessions WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC${limit ? ` LIMIT ${limit}` : ''}`;
  const rows = db.query(sql).all(...params) as SessionRow[];
  return rows.map(mapRowToSession);
}
