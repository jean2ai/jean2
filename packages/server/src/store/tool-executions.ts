import { getDatabase } from './index';
import type { ToolExecution } from '@jean2/sdk';

// Interface for raw database row from tool_executions table
interface ToolExecutionRow {
  id: string;
  message_id: string;
  tool_call_id: string;
  tool_name: string;
  args: string;
  result: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export function createToolExecution(execution: Omit<ToolExecution, 'completedAt'> & { completedAt?: string | null }): ToolExecution {
  const db = getDatabase();
  const e: ToolExecution = {
    ...execution,
    completedAt: execution.completedAt || null,
  };
  
  db.run(`
    INSERT INTO tool_executions (id, message_id, tool_call_id, tool_name, args, result, error, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    e.id,
    e.messageId,
    e.toolCallId,
    e.toolName,
    JSON.stringify(e.args),
    e.result !== undefined ? JSON.stringify(e.result) : null,
    e.error,
    e.startedAt,
    e.completedAt
  ]);
  
  return e;
}

export function updateToolExecution(id: string, updates: { result?: unknown; error?: string | null; completedAt?: string }): void {
  const db = getDatabase();
  const setClauses: string[] = [];
  const values: (string | null)[] = [];
  
  if (updates.result !== undefined) {
    setClauses.push('result = ?');
    values.push(JSON.stringify(updates.result));
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    values.push(updates.error);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  
  if (setClauses.length > 0) {
    values.push(id);
    db.run(`UPDATE tool_executions SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }
}

export function getToolExecution(id: string): ToolExecution | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM tool_executions WHERE id = ?').get(id) as ToolExecutionRow | undefined;
  if (!row) return null;
  return mapRowToToolExecution(row);
}

export function listToolExecutions(messageId: string): ToolExecution[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM tool_executions WHERE message_id = ? ORDER BY started_at ASC').all(messageId) as ToolExecutionRow[];
  return rows.map(mapRowToToolExecution);
}

function mapRowToToolExecution(row: ToolExecutionRow): ToolExecution {
  return {
    id: row.id,
    messageId: row.message_id,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    args: JSON.parse(row.args),
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
