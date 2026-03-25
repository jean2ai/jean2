import { getDatabase } from './index';
import type { Session, SessionStatus, SubagentStatus, Workspace } from '@jean2/shared';
import { getWorkspace } from './workspaces';
import { rmSync, existsSync } from 'fs';

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
}

export function createSession(session: Omit<Session, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): Session {
  const db = getDatabase();
  const now = new Date().toISOString();
  const s: Session = {
    ...session,
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
  };
  
  db.run(`
    INSERT INTO sessions (id, workspace_id, preconfig_id, title, status, created_at, updated_at, metadata, selected_model, selected_provider, selected_variant, prompt_tokens, completion_tokens, total_tokens, parent_id, agent_name, subagent_status, running_at, compacting)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)
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

export function updateSession(id: string, updates: Partial<Pick<Session, 'title' | 'status' | 'metadata' | 'preconfigId' | 'selectedModel' | 'selectedProvider' | 'selectedVariant' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'parentId' | 'agentName' | 'subagentStatus' | 'runningAt' | 'compacting'>>): Session | null {
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
  
  values.push(id);
  
  db.run(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`, values as (string | number)[]);
  return getSession(id);
}

const OUTPUT_DIR_PREFIX = '/tmp/jean2/';

function cleanupSessionOutputDir(sessionId: string): void {
  const dir = `${OUTPUT_DIR_PREFIX}${sessionId}`;
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[cleanup] Failed to remove output dir ${dir}:`, err);
    }
  }
}

export function deleteSession(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM sessions WHERE id = ?', [id]);

  if (result.changes > 0) {
    cleanupSessionOutputDir(id);
  }

  return result.changes > 0;
}

export function listSessionsByWorkspace(workspaceId: string): Session[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as SessionRow[];
  return rows.map(mapRowToSession);
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
  };
}

export function getChildSessions(parentId: string): Session[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM sessions WHERE parent_id = ? ORDER BY created_at ASC').all(parentId) as SessionRow[];
  return rows.map(mapRowToSession);
}
