import { getDatabase } from './index';
import type { ToolApproval, ToolApprovalStatus } from '@jean2/sdk';

// Interface for raw database row from tool_approvals table
interface ToolApprovalRow {
  id: string;
  session_id: string;
  child_session_id: string | null;
  subagent_name: string | null;
  tool_call_id: string;
  tool_name: string;
  args: string;
  permission_type: string | null;
  permission_key: string | null;
  message: string | null;
  details: string | null;
  status: string;
  requested_at: string;
  responded_at: string | null;
}

export function createToolApproval(approval: ToolApproval): ToolApproval {
  const db = getDatabase();
  
  db.run(`
    INSERT INTO tool_approvals (id, session_id, child_session_id, subagent_name, tool_call_id, tool_name, args, permission_type, permission_key, message, details, status, requested_at, responded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    approval.id,
    approval.sessionId,
    approval.childSessionId || null,
    approval.subagentName || null,
    approval.toolCallId,
    approval.toolName,
    JSON.stringify(approval.args),
    approval.permissionType || null,
    approval.permissionKey || null,
    approval.message || null,
    approval.details ? JSON.stringify(approval.details) : null,
    approval.status,
    approval.requestedAt,
    approval.respondedAt || null
  ]);
  
  return approval;
}

export function updateToolApproval(id: string, updates: { status: ToolApprovalStatus; respondedAt?: string }): void {
  const db = getDatabase();
  db.run(`
    UPDATE tool_approvals SET status = ?, responded_at = ? WHERE id = ?
  `, [updates.status, updates.respondedAt || null, id]);
}

export function getToolApproval(id: string): ToolApproval | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM tool_approvals WHERE id = ?').get(id) as ToolApprovalRow | undefined;
  if (!row) return null;
  return mapRowToToolApproval(row);
}

export function getToolApprovalByCallId(toolCallId: string): ToolApproval | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM tool_approvals WHERE tool_call_id = ?').get(toolCallId) as ToolApprovalRow | undefined;
  if (!row) return null;
  return mapRowToToolApproval(row);
}

export function listPendingApprovals(sessionId: string): ToolApproval[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM tool_approvals WHERE session_id = ? AND status = ? ORDER BY requested_at ASC').all(sessionId, 'pending') as ToolApprovalRow[];
  return rows.map(mapRowToToolApproval);
}

export function listAllPendingApprovals(): ToolApproval[] {
  const db = getDatabase();
  const rows = db.query('SELECT * FROM tool_approvals WHERE status = ? ORDER BY requested_at ASC').all('pending') as ToolApprovalRow[];
  return rows.map(mapRowToToolApproval);
}

function mapRowToToolApproval(row: ToolApprovalRow): ToolApproval {
  return {
    id: row.id,
    sessionId: row.session_id,
    childSessionId: row.child_session_id || undefined,
    subagentName: row.subagent_name || undefined,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    args: JSON.parse(row.args),
    permissionType: row.permission_type || undefined,
    permissionKey: row.permission_key || undefined,
    message: row.message || undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    status: row.status as ToolApprovalStatus,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at ?? undefined,
  };
}
