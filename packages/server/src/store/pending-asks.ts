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
