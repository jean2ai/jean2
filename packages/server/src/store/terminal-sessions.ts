import { getDatabase } from './index';

export interface TerminalSessionRow {
  id: string;
  workspace_id: string;
  cwd: string;
  shell: string;
  title: string;
  status: 'running' | 'exited' | 'destroyed';
  exit_code: number | null;
  pid: number | null;
  cols: number;
  rows: number;
  created_at: number;
  last_activity_at: number;
  destroyed_at: number | null;
}

export function createTerminalSession(session: {
  id: string;
  workspaceId: string;
  cwd: string;
  shell: string;
  pid: number;
  cols: number;
  rows: number;
}): void {
  const now = Date.now();
  getDatabase().run(
    `INSERT INTO terminal_sessions (id, workspace_id, cwd, shell, pid, cols, rows, title, status, created_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'main', 'running', ?, ?)`,
    [
      session.id,
      session.workspaceId,
      session.cwd,
      session.shell,
      session.pid,
      session.cols,
      session.rows,
      now,
      now,
    ]
  );
}

export function updateTerminalSessionTitle(id: string, title: string): void {
  getDatabase().run(
    `UPDATE terminal_sessions SET title = ? WHERE id = ?`,
    [title, id]
  );
}

export function updateTerminalSessionActivity(id: string): void {
  const now = Date.now();
  getDatabase().run(
    `UPDATE terminal_sessions SET last_activity_at = ? WHERE id = ?`,
    [now, id]
  );
}

export function markTerminalSessionExited(id: string, exitCode: number): void {
  const now = Date.now();
  getDatabase().run(
    `UPDATE terminal_sessions SET status = 'exited', exit_code = ?, last_activity_at = ? WHERE id = ?`,
    [exitCode, now, id]
  );
}

export function markTerminalSessionDestroyed(id: string): void {
  const now = Date.now();
  getDatabase().run(
    `UPDATE terminal_sessions SET status = 'destroyed', destroyed_at = ?, last_activity_at = ? WHERE id = ?`,
    [now, now, id]
  );
}

export function getTerminalSession(id: string): TerminalSessionRow | null {
  const row = getDatabase().query(
    `SELECT * FROM terminal_sessions WHERE id = ?`
  ).get(id) as TerminalSessionRow | undefined;
  return row ?? null;
}

export function listTerminalSessions(workspaceId: string): TerminalSessionRow[] {
  return getDatabase().query(
    `SELECT * FROM terminal_sessions WHERE workspace_id = ? ORDER BY created_at ASC`
  ).all(workspaceId) as TerminalSessionRow[];
}

export function listActiveTerminalSessions(workspaceId: string): TerminalSessionRow[] {
  return getDatabase().query(
    `SELECT * FROM terminal_sessions WHERE workspace_id = ? AND status IN ('running', 'exited') ORDER BY created_at ASC`
  ).all(workspaceId) as TerminalSessionRow[];
}

export function cleanupStaleTerminalSessions(): number {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const result = getDatabase().run(
    `DELETE FROM terminal_sessions WHERE status = 'destroyed' AND destroyed_at < ?`,
    [cutoff]
  );
  return result.changes;
}

export function cleanupRunningSessionsOnStartup(): number {
  const result = getDatabase().run(
    `UPDATE terminal_sessions SET status = 'destroyed', destroyed_at = ? WHERE status = 'running'`,
    [Date.now()]
  );
  return result.changes;
}
