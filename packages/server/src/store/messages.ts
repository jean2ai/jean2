import { getDatabase } from './index';
import { getSession } from './sessions';
import { indexMessage as ftsIndexMessage, removeMessageFromFts, removeSessionFromFts, getMessageContentForFts } from '@/session-search/fts';
import type {
  Message,
  Part,
  MessageWithParts,

  UserMessage,
  SystemMessage,
  AssistantMessage,
  ToolPart,
} from '@jean2/sdk';

// =============================================================================
// Row Types
// =============================================================================

interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  created_at: number;
  status: 'streaming' | 'completed' | 'error' | 'interrupted' | null;
  model_id: string | null;
  provider_id: string | null;
  agent: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
  completed_at: number | null;
  error: string | null;
  // Compaction metadata
  summary: number;
  mode: string | null;
  parent_id: string | null;
  // Structured output
  structured_output: string | null;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  type: string;
  data: string;
  created_at: number;
}

// =============================================================================
// Message Mappers
// =============================================================================

function rowToMessage(row: MessageRow): Message {
  const base = {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    createdAt: row.created_at,
  };

  if (row.role === 'assistant') {
    return {
      ...base,
      role: 'assistant' as const,
      status: row.status as 'streaming' | 'completed' | 'error' | 'interrupted',
      modelId: row.model_id!,
      providerId: row.provider_id!,
      agent: row.agent ?? undefined,
      tokens: {
        prompt: row.tokens_prompt,
        completion: row.tokens_completion,
      },
      cost: row.cost,
      completedAt: row.completed_at ?? undefined,
      error: row.error ?? undefined,
      summary: row.summary ? true : undefined,
      mode: (row.mode as 'chat' | 'compaction' | 'compact_failed' | undefined) ?? undefined,
      parentId: row.parent_id ?? undefined,
      structuredOutput: row.structured_output ? JSON.parse(row.structured_output) : undefined,
    } as AssistantMessage;
  }

  return base as UserMessage | SystemMessage;
}

function messageToRow(message: Message): MessageRow {
  const base: MessageRow = {
    id: message.id,
    session_id: message.sessionId,
    role: message.role,
    created_at: message.createdAt,
    status: null,
    model_id: null,
    provider_id: null,
    agent: null,
    tokens_prompt: 0,
    tokens_completion: 0,
    cost: 0,
    completed_at: null,
    error: null,
    summary: 0,
    mode: null,
    parent_id: null,
    structured_output: null,
  };

  if (message.role === 'assistant') {
    return {
      ...base,
      status: message.status,
      model_id: message.modelId,
      provider_id: message.providerId,
      agent: message.agent ?? null,
      tokens_prompt: message.tokens.prompt,
      tokens_completion: message.tokens.completion,
      cost: message.cost,
      completed_at: message.completedAt ?? null,
      error: message.error ?? null,
      summary: message.summary ? 1 : 0,
      mode: message.mode ?? null,
      parent_id: message.parentId ?? null,
      structured_output: message.structuredOutput ? JSON.stringify(message.structuredOutput) : null,
    };
  }

  return base;
}

// =============================================================================
// Part Mappers
// =============================================================================

function rowToPart(row: PartRow): Part {
  const data = JSON.parse(row.data);
  return {
    id: row.id,
    messageId: row.message_id,
    createdAt: row.created_at,
    ...data,
  } as Part;
}

function partToRow(part: Part, sessionId: string): PartRow {
  const { id, messageId, createdAt, ...data } = part;
  return {
    id,
    message_id: messageId,
    session_id: sessionId,
    type: part.type,
    data: JSON.stringify(data),
    created_at: createdAt,
  };
}

// =============================================================================
// Message CRUD
// =============================================================================

export function createMessage(message: Message): Message {
  const db = getDatabase();
  const row = messageToRow(message);

  db.run(
    `
    INSERT INTO messages (
      id, session_id, role, created_at, status, model_id, provider_id,
      agent, tokens_prompt, tokens_completion, cost, completed_at, error,
      summary, mode, parent_id, structured_output
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      row.id,
      row.session_id,
      row.role,
      row.created_at,
      row.status,
      row.model_id,
      row.provider_id,
      row.agent,
      row.tokens_prompt,
      row.tokens_completion,
      row.cost,
      row.completed_at,
      row.error,
      row.summary,
      row.mode,
      row.parent_id,
      row.structured_output,
    ],
  );

  syncMessageToFts(message.id, message.sessionId, message.role);

  return message;
}

export function getMessage(id: string): Message | null {
  const db = getDatabase();
  const row = db
    .query('SELECT * FROM messages WHERE id = ?')
    .get(id) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function updateMessage(
  id: string,
  updates: Partial<Message>,
): Message | null {
  const db = getDatabase();
  const existing = getMessage(id);
  if (!existing) return null;

  const updated: Message = { ...existing, ...updates } as Message;
  const row = messageToRow(updated);

  db.run(
    `
    UPDATE messages SET
      status = ?, model_id = ?, provider_id = ?, agent = ?,
      tokens_prompt = ?, tokens_completion = ?, cost = ?,
      completed_at = ?, error = ?,
      summary = ?, mode = ?, parent_id = ?, structured_output = ?
    WHERE id = ?
  `,
    [
      row.status,
      row.model_id,
      row.provider_id,
      row.agent,
      row.tokens_prompt,
      row.tokens_completion,
      row.cost,
      row.completed_at,
      row.error,
      row.summary,
      row.mode,
      row.parent_id,
      row.structured_output,
      id,
    ],
  );

  syncMessageToFts(id, updated.sessionId, updated.role);

  return updated;
}

export function listMessages(sessionId: string): Message[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function deleteMessages(sessionId: string): number {
  const db = getDatabase();
  removeSessionFromFts(sessionId);
  const result = db.run('DELETE FROM messages WHERE session_id = ?', [
    sessionId,
  ]);
  return result.changes;
}

export function deleteMessage(messageId: string): boolean {
  const db = getDatabase();
  removeMessageFromFts(messageId);
  db.run('DELETE FROM parts WHERE message_id = ?', [messageId]);
  const result = db.run('DELETE FROM messages WHERE id = ?', [messageId]);
  return result.changes > 0;
}

// =============================================================================
// Part CRUD
// =============================================================================

export function createPart(part: Part, sessionId: string): Part {
  const db = getDatabase();
  const row = partToRow(part, sessionId);

  db.run(
    `
    INSERT INTO parts (id, message_id, session_id, type, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [row.id, row.message_id, row.session_id, row.type, row.data, row.created_at],
  );

  if (part.type === 'text' || part.type === 'tool') {
    const msg = getMessage(part.messageId);
    if (msg) syncMessageToFts(msg.id, msg.sessionId, msg.role);
  }

  return part;
}

export function getPart(id: string): Part | null {
  const db = getDatabase();
  const row = db
    .query('SELECT * FROM parts WHERE id = ?')
    .get(id) as PartRow | undefined;
  return row ? rowToPart(row) : null;
}

export function updatePart(
  id: string,
  updates: Record<string, unknown>,
  options?: { syncFts?: boolean },
): Part | null {
  const db = getDatabase();
  const existing = getPart(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates } as Part;

  const message = getMessage(existing.messageId);
  if (!message) return null;

  const row = partToRow(updated, message.sessionId);

  db.run(`UPDATE parts SET type = ?, data = ? WHERE id = ?`, [
    row.type,
    row.data,
    id,
  ]);

  if (
    options?.syncFts !== false &&
    (existing.type === 'text' || existing.type === 'tool' || updated.type === 'text' || updated.type === 'tool')
  ) {
    syncMessageToFts(message.id, message.sessionId, message.role);
  }

  return updated;
}

export function getPartsByMessage(messageId: string): Part[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM parts WHERE message_id = ? ORDER BY created_at ASC')
    .all(messageId) as PartRow[];
  return rows.map(rowToPart);
}

export function getPartsBySession(sessionId: string): Part[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM parts WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as PartRow[];
  return rows.map(rowToPart);
}

// =============================================================================
// Combined View
// =============================================================================

interface JoinedMessagePartRow extends MessageRow {
  part_id: string | null;
  part_message_id: string | null;
  part_session_id: string | null;
  part_type: string | null;
  part_data: string | null;
  part_created_at: number | null;
}

function groupJoinedRows(rows: JoinedMessagePartRow[]): MessageWithParts[] {
  const byMessage = new Map<string, MessageWithParts>();
  for (const row of rows) {
    let entry = byMessage.get(row.id);
    if (!entry) {
      entry = { message: rowToMessage(row), parts: [] };
      byMessage.set(row.id, entry);
    }
    if (row.part_id) {
      const partRow: PartRow = {
        id: row.part_id,
        message_id: row.part_message_id!,
        session_id: row.part_session_id!,
        type: row.part_type!,
        data: row.part_data!,
        created_at: row.part_created_at!,
      };
      entry.parts.push(rowToPart(partRow));
    }
  }
  return [...byMessage.values()];
}

export function getMessageWithParts(
  messageId: string,
): MessageWithParts | null {
  const message = getMessage(messageId);
  if (!message) return null;

  const parts = getPartsByMessage(messageId);
  return { message, parts };
}

export function listMessagesWithParts(sessionId: string): MessageWithParts[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT m.*, p.id AS part_id, p.message_id AS part_message_id,
              p.session_id AS part_session_id, p.type AS part_type,
              p.data AS part_data, p.created_at AS part_created_at
       FROM messages m
       LEFT JOIN parts p ON p.message_id = m.id
       WHERE m.session_id = ?
       ORDER BY m.created_at ASC, p.created_at ASC`,
    )
    .all(sessionId) as JoinedMessagePartRow[];
  return groupJoinedRows(rows);
}

// =============================================================================
// Tool State Transitions
// =============================================================================

export function createToolPartPending(
  messageId: string,
  callId: string,
  toolName: string,
  input: Record<string, unknown>,
  sessionId: string,
): ToolPart {
  const part: ToolPart = {
    id: crypto.randomUUID(),
    messageId,
    createdAt: Date.now(),
    type: 'tool',
    callId,
    name: toolName,
    state: {
      status: 'pending',
      input,
    },
  };

  createPart(part, sessionId);
  return part;
}

export function transitionToolToRunning(
  partId: string,
  childSessionId?: string,
): ToolPart | null {
  const existing = getPart(partId);
  if (!existing || existing.type !== 'tool') return null;

  const toolPart = existing as ToolPart;
  if (toolPart.state.status !== 'pending') return null;

  const updated: ToolPart = {
    ...toolPart,
    state: {
      status: 'running',
      input: toolPart.state.input,
      startedAt: Date.now(),
      ...(childSessionId && { childSessionId }),
    },
  };

  return updatePart(partId, { state: updated.state }) as ToolPart;
}

export function transitionToolToCompleted(
  partId: string,
  output: unknown,
): ToolPart | null {
  const existing = getPart(partId);
  if (!existing || existing.type !== 'tool') return null;

  const toolPart = existing as ToolPart;
  if (toolPart.state.status !== 'running') return null;

  const now = Date.now();
  const updated: ToolPart = {
    ...toolPart,
    state: {
      status: 'completed',
      input: toolPart.state.input,
      output,
      startedAt: toolPart.state.startedAt,
      completedAt: now,
      ...(toolPart.state.childSessionId && { childSessionId: toolPart.state.childSessionId }),
    },
  };

  return updatePart(partId, { state: updated.state }) as ToolPart;
}

export function transitionToolToError(partId: string, error: string): ToolPart | null {
  const existing = getPart(partId);
  if (!existing || existing.type !== 'tool') return null;

  const toolPart = existing as ToolPart;
  const now = Date.now();

  const updated: ToolPart = {
    ...toolPart,
    state: {
      status: 'error',
      input: toolPart.state.input,
      error,
      startedAt:
        toolPart.state.status === 'running'
          ? toolPart.state.startedAt
          : now,
      failedAt: now,
    },
  };

  return updatePart(partId, { state: updated.state }) as ToolPart;
}

export function transitionToolToRunningByCallId(
  sessionId: string,
  callId: string,
  childSessionId?: string,
): ToolPart | null {
  const allParts = getPartsBySession(sessionId);
  const toolPart = allParts.find(
    (p) => p.type === 'tool' && (p as ToolPart).callId === callId,
  ) as ToolPart | undefined;

  if (!toolPart || toolPart.state.status !== 'pending') return null;

  const updated: ToolPart = {
    ...toolPart,
    state: {
      status: 'running',
      input: toolPart.state.input,
      startedAt: Date.now(),
      ...(childSessionId && { childSessionId }),
    },
  };

  return updatePart(toolPart.id, { state: updated.state }) as ToolPart;
}

// =============================================================================
// Interrupted Tool Call Recovery
// =============================================================================

export type ToolInterruptReason = 'user_request' | 'timeout' | 'error' | 'cascade';

export function transitionToolToInterrupted(
  partId: string,
  reason: ToolInterruptReason,
): ToolPart | null {
  const existing = getPart(partId);
  if (!existing || existing.type !== 'tool') return null;

  const toolPart = existing as ToolPart;
  const now = Date.now();

  const updated: ToolPart = {
    ...toolPart,
    state: {
      status: 'interrupted',
      input: toolPart.state.input,
      startedAt:
        toolPart.state.status === 'running'
          ? toolPart.state.startedAt
          : now,
      interruptedAt: now,
      reason,
      ...('childSessionId' in toolPart.state && { childSessionId: (toolPart.state as { childSessionId: string }).childSessionId }),
    },
  };

  return updatePart(partId, { state: updated.state }) as ToolPart;
}

export function findOrphanedToolCalls(sessionId: string): ToolPart[] {
  const allParts = getPartsBySession(sessionId);
  return allParts.filter(
    (p) => p.type === 'tool' && ((p as ToolPart).state.status === 'pending' || (p as ToolPart).state.status === 'running'),
  ) as ToolPart[];
}

export function reconcileOrphanedToolCalls(sessionId: string): number {
  const orphaned = findOrphanedToolCalls(sessionId);
  for (const toolPart of orphaned) {
    transitionToolToInterrupted(toolPart.id, 'error');
  }
  return orphaned.length;
}

export function reconcileAllOrphanedToolCalls(): number {
  const db = getDatabase();
  const orphanedIds = db
    .query(
      `SELECT id FROM parts
       WHERE type = 'tool'
         AND (JSON_EXTRACT(data, '$.state.status') = 'pending'
              OR JSON_EXTRACT(data, '$.state.status') = 'running')`,
    )
    .all() as { id: string }[];

  let totalReconciled = 0;
  for (const { id } of orphanedIds) {
    if (transitionToolToInterrupted(id, 'error')) {
      totalReconciled++;
    }
  }
  if (totalReconciled > 0) {
    console.log(`[tool-recovery] Reconciled ${totalReconciled} orphaned tool call(s)`);
  }
  return totalReconciled;
}

// =============================================================================
// Compaction Recovery (Workstream 2)
// =============================================================================

/**
 * Find orphaned compaction triggers for a session.
 *
 * An orphaned trigger is a user message that has a 'compaction' part,
 * but NO assistant message exists with parentId pointing to it.
 * This can happen if compaction crashed/interrupted after trigger creation.
 *
 * The query:
 * 1. Finds all user messages with a compaction part (potential triggers)
 * 2. LEFT JOINs against assistant messages where parent_id matches
 * 3. Returns only those where no assistant outcome was found
 *
 * Uses existing indexes: idx_messages_session_created (session_id, created_at)
 * and idx_messages_parent (parent_id).
 */
export function findOrphanedCompactionTriggers(sessionId: string): Message[] {
  const db = getDatabase();

  // Find user messages with a 'compaction' part that have no assistant outcome
  const rows = db
    .query(
      `
      SELECT m.* FROM messages m
      WHERE m.session_id = ?
        AND m.role = 'user'
        AND EXISTS (
          SELECT 1 FROM parts p
          WHERE p.message_id = m.id AND p.type = 'compaction'
        )
        AND NOT EXISTS (
          SELECT 1 FROM messages outcome
          WHERE outcome.parent_id = m.id
        )
      ORDER BY m.created_at ASC
      `,
    )
    .all(sessionId) as MessageRow[];

  return rows.map(rowToMessage);
}

// =============================================================================
// Compaction-Aware Loading (Append-Only History with Traversal)
// =============================================================================

/**
 * List all messages for a session (full history for UI inspection).
 */
export function listMessagesForSession(sessionId: string): MessageWithParts[] {
  return listMessagesWithParts(sessionId);
}

/**
 * Build effective context history by traversing append-only history.
 *
 * Compaction model:
 * - All messages remain in the database (append-only)
 * - Compaction trigger is a user message with a 'compaction' part
 * - Summary assistant message has parentId pointing to trigger, summary=true, mode='compaction'
 *
 * Effective context includes:
 * - The compaction trigger message (with 'compaction' part)
 * - The summary assistant message (with summary=true, mode='compaction')
 * - All messages AFTER the summary (i.e., subsequent user/assistant turns)
 *
 * Pre-boundary history (before trigger) is EXCLUDED from model context.
 */
export function buildEffectiveContextHistory(
  sessionId: string,
): {
  messages: MessageWithParts[];
  latestCompactionBoundary: string | null;
  hasCompaction: boolean;
} {
  const allMessages = listMessagesForSession(sessionId);

  // Find the latest trigger+summary pair
  // The trigger (user message with 'compaction' part) comes BEFORE its summary
  // We need to find the trigger's index to return it + summary + subsequent
  let latestTriggerIndex = -1;

  for (let i = allMessages.length - 1; i >= 0; i--) {
    const item = allMessages[i];
    const msg = item.message;

    // Look for summary assistant messages (they indicate end of a compaction boundary)
    if (
      msg.role === 'assistant' &&
      (msg as AssistantMessage).summary === true &&
      (msg as AssistantMessage).mode === 'compaction' &&
      (msg as AssistantMessage).parentId
    ) {
      // Found a summary - now find its trigger (parentId)
      const triggerId = (msg as AssistantMessage).parentId!;
      const triggerIndex = allMessages.findIndex((m) => m.message.id === triggerId);
      if (triggerIndex !== -1) {
        latestTriggerIndex = triggerIndex;
        break;
      }
    }
  }

  // If no compaction boundary found, return all messages
  if (latestTriggerIndex === -1) {
    return {
      messages: allMessages,
      latestCompactionBoundary: null,
      hasCompaction: false,
    };
  }

  // Return messages from trigger onwards (trigger + summary + subsequent)
  const effectiveMessages = allMessages.slice(latestTriggerIndex);
  const boundaryMsgId = allMessages[latestTriggerIndex].message.id;

  return {
    messages: effectiveMessages,
    latestCompactionBoundary: boundaryMsgId,
    hasCompaction: true,
  };
}

// =============================================================================
// FTS Sync Helper
// =============================================================================

function syncMessageToFts(messageId: string, sessionId: string, role: string): void {
  try {
    const session = getSession(sessionId);
    if (!session?.workspaceId) return;

    const { content, toolName } = getMessageContentForFts(messageId);
    ftsIndexMessage(messageId, sessionId, session.workspaceId, role, content, toolName, session.agentId);
  } catch {
    // FTS sync failure should not break message operations
  }
}
