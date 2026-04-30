import { getDatabase } from './index';
import type { Ask } from '@jean2/sdk';

interface PendingAskRow {
  id: string;
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  ask_json: string;
  created_at: number;
}

export interface PendingAskRecord {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  ask: Ask;
  createdAt: number;
}

export function createPendingAsk(record: Omit<PendingAskRecord, 'id'>): string {
  const db = getDatabase();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO pending_asks (id, session_id, tool_call_id, tool_name, ask_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, record.sessionId, record.toolCallId, record.toolName, JSON.stringify(record.ask), record.createdAt],
  );
  return id;
}

export function removePendingAsk(id: string): void {
  const db = getDatabase();
  db.run('DELETE FROM pending_asks WHERE id = ?', [id]);
}

export function removePendingAsksByToolCallId(toolCallId: string): void {
  const db = getDatabase();
  db.run('DELETE FROM pending_asks WHERE tool_call_id = ?', [toolCallId]);
}

export function listPendingAsksBySession(sessionId: string): PendingAskRecord[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM pending_asks WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as PendingAskRow[];
  return rows.map(mapRowToPendingAsk);
}

function mapRowToPendingAsk(row: PendingAskRow): PendingAskRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    ask: JSON.parse(row.ask_json),
    createdAt: row.created_at,
  };
}

export function listPendingAsksByRootSession(rootSessionId: string): PendingAskRecord[] {
  const db = getDatabase();

  // Find all descendant session IDs (children, grandchildren, etc.) using BFS
  const descendantIds: string[] = [];
  const queue = [rootSessionId];
  while (queue.length > 0) {
    const currentParentId = queue.shift()!;
    const children = db
      .query('SELECT id FROM sessions WHERE parent_id = ?')
      .all(currentParentId) as { id: string }[];
    for (const child of children) {
      descendantIds.push(child.id);
      queue.push(child.id);
    }
  }

  // Query pending asks for root + all descendants
  const allIds = [rootSessionId, ...descendantIds];
  if (allIds.length === 1) {
    // Simple case - no descendants
    return listPendingAsksBySession(rootSessionId);
  }

  const placeholders = allIds.map(() => '?').join(',');
  const rows = db
    .query(`SELECT * FROM pending_asks WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...allIds) as PendingAskRow[];
  return rows.map(mapRowToPendingAsk);
}

export function listAllPendingAsks(): PendingAskRecord[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM pending_asks ORDER BY created_at ASC')
    .all() as PendingAskRow[];
  return rows.map(mapRowToPendingAsk);
}

export function cleanupAllPendingAsks(maxAgeMs?: number): number {
  const db = getDatabase();
  if (maxAgeMs !== undefined) {
    const cutoff = Date.now() - maxAgeMs;
    const result = db.run('DELETE FROM pending_asks WHERE created_at < ?', [cutoff]);
    return result.changes;
  }
  const result = db.run('DELETE FROM pending_asks');
  return result.changes;
}
