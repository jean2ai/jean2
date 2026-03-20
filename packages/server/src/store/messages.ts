import { getDatabase } from './index';
import type {
  Message,
  Part,
  MessageWithParts,

  UserMessage,
  SystemMessage,
  ToolPart,
} from '@jean2/shared';

// =============================================================================
// Row Types
// =============================================================================

interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  created_at: number;
  status: 'streaming' | 'completed' | 'error' | null;
  model_id: string | null;
  provider_id: string | null;
  agent: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
  completed_at: number | null;
  error: string | null;
  compacted: number;
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
      role: 'assistant',
      status: row.status as 'streaming' | 'completed' | 'error',
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
    };
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
    compacted: 0,
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
      agent, tokens_prompt, tokens_completion, cost, completed_at, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ],
  );

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
      completed_at = ?, error = ?
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
      id,
    ],
  );

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
  const result = db.run('DELETE FROM messages WHERE session_id = ?', [
    sessionId,
  ]);
  return result.changes;
}

export function deleteMessage(messageId: string): boolean {
  const db = getDatabase();
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

export function getMessageWithParts(
  messageId: string,
): MessageWithParts | null {
  const message = getMessage(messageId);
  if (!message) return null;

  const parts = getPartsByMessage(messageId);
  return { message, parts };
}

export function listMessagesWithParts(sessionId: string): MessageWithParts[] {
  const messages = listMessages(sessionId);
  return messages.map((message) => ({
    message,
    parts: getPartsByMessage(message.id),
  }));
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
// Compaction-Aware Loading
// =============================================================================

export function markMessagesCompacted(messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const db = getDatabase();
  const placeholders = messageIds.map(() => '?').join(', ');
  db.run(
    `UPDATE messages SET compacted = 1 WHERE id IN (${placeholders})`,
    messageIds,
  );
}

export function getLatestCompactionSummary(sessionId: string): string | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT p.data FROM parts p
       JOIN messages m ON p.message_id = m.id
       WHERE p.session_id = ? AND p.type = 'compaction'
       ORDER BY m.created_at DESC
       LIMIT 1`,
    )
    .get(sessionId) as { data: string } | undefined;
  if (!row) return null;
  const data = JSON.parse(row.data);
  return data.summary ?? null;
}

export function listMessagesForContext(sessionId: string): MessageWithParts[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT * FROM messages WHERE session_id = ? AND compacted = 0 ORDER BY created_at ASC`,
    )
    .all(sessionId) as MessageRow[];

  return rows.map((row) => ({
    message: rowToMessage(row),
    parts: getPartsByMessage(row.id),
  }));
}
