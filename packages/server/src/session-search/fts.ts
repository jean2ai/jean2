import { getDatabase } from '@/store';

const MAX_SNIPPET_LENGTH = 500;

export interface FtsSearchResult {
  messageId: string;
  sessionId: string;
  workspaceId: string;
  role: string;
  content: string;
  timestamp: number;
  sessionTitle: string | null;
  rank: number;
}

export function initializeFts(db: ReturnType<typeof getDatabase>): void {
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      message_id UNINDEXED,
      session_id UNINDEXED,
      workspace_id UNINDEXED,
      agent_id UNINDEXED,
      role UNINDEXED,
      content,
      tool_name,
      tokenize = 'unicode61'
    )
  `);
}

export function migrateFtsForAgents(db: ReturnType<typeof getDatabase>): void {
  const cols = db.prepare("PRAGMA table_info(messages_fts)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'agent_id')) {
    db.run('DROP TABLE IF EXISTS messages_fts');
    initializeFts(db);
  }
}

const BACKFILL_BATCH_SIZE = 500;
const BACKFILL_PROGRESS_INTERVAL = 5000;

export function backfillFts(): number {
  const db = getDatabase();

  const ftsCount = (db.query('SELECT COUNT(*) as cnt FROM messages_fts').get() as { cnt: number }).cnt;
  if (ftsCount > 0) return 0;

  const msgCount = (db.query('SELECT COUNT(*) as cnt FROM messages').get() as { cnt: number }).cnt;
  if (msgCount === 0) return 0;

  console.log(`[fts] Backfilling ${msgCount} messages into search index...`);

  const totalBackfilled = batchBackfill(db, BACKFILL_BATCH_SIZE);

  console.log(`[fts] Backfill complete: ${totalBackfilled} messages indexed`);
  return totalBackfilled;
}

function batchBackfill(db: ReturnType<typeof getDatabase>, batchSize: number): number {
  const totalMsgs = (db.query('SELECT COUNT(*) as cnt FROM messages').get() as { cnt: number }).cnt;
  const totalBatches = Math.ceil(totalMsgs / batchSize);

  let totalBackfilled = 0;
  let offset = 0;

  for (let batch = 0; batch < totalBatches; batch++) {
    db.transaction(() => {
      const rows = db.query(`
        SELECT
          m.id as message_id,
          m.session_id,
          s.workspace_id,
          s.agent_id,
          m.role,
          m.created_at,
          GROUP_CONCAT(
            CASE
              WHEN p.type = 'text' THEN json_extract(p.data, '$.text')
              WHEN p.type = 'reasoning' THEN json_extract(p.data, '$.text')
              WHEN p.type = 'tool' THEN json_extract(p.data, '$.name')
              ELSE NULL
            END, ' '
          ) as content,
          GROUP_CONCAT(
            CASE
              WHEN p.type = 'tool' THEN json_extract(p.data, '$.name')
              ELSE NULL
            END, ' '
          ) as tool_name
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        LEFT JOIN parts p ON p.message_id = m.id
        WHERE s.workspace_id IS NOT NULL
        GROUP BY m.id
        ORDER BY m.created_at ASC
        LIMIT ? OFFSET ?
      `).all(batchSize, offset) as Array<{
        message_id: string;
        session_id: string;
        workspace_id: string;
        agent_id: string | null;
        role: string;
        created_at: number;
        content: string | null;
        tool_name: string | null;
      }>;

      const insertStmt = db.prepare(`
        INSERT INTO messages_fts (message_id, session_id, workspace_id, agent_id, role, content, tool_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        if (!row.content && !row.tool_name) continue;
        insertStmt.run(
          row.message_id,
          row.session_id,
          row.workspace_id,
          row.agent_id,
          row.role,
          row.content ?? '',
          row.tool_name ?? '',
        );
        totalBackfilled++;
      }

      offset += batchSize;
    })();

    if (totalBackfilled >= (batch + 1) * BACKFILL_PROGRESS_INTERVAL) {
      console.log(`[fts] Backfill progress: ${totalBackfilled}/${totalMsgs} messages`);
    }
  }

  return totalBackfilled;
}

export function indexMessage(
  messageId: string,
  sessionId: string,
  workspaceId: string,
  role: string,
  content: string,
  toolName: string,
  agentId?: string | null,
): void {
  const db = getDatabase();
  if (!content && !toolName) return;

  db.run(
    'DELETE FROM messages_fts WHERE message_id = ?',
    [messageId],
  );

  db.run(
    'INSERT INTO messages_fts (message_id, session_id, workspace_id, agent_id, role, content, tool_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [messageId, sessionId, workspaceId, agentId ?? null, role, content, toolName],
  );
}

export function removeMessageFromFts(messageId: string): void {
  const db = getDatabase();
  db.run('DELETE FROM messages_fts WHERE message_id = ?', [messageId]);
}

export function removeSessionFromFts(sessionId: string): void {
  const db = getDatabase();
  db.run('DELETE FROM messages_fts WHERE session_id = ?', [sessionId]);
}

export interface SearchOptions {
  query: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
  roleFilter: string[];
  limit: number;
  sort: 'relevance' | 'newest' | 'oldest';
}

export function searchMessages(options: SearchOptions): FtsSearchResult[] {
  const db = getDatabase();
  const { query, workspaceId, agentId, sessionId, roleFilter, limit, sort } = options;

  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  const rolePlaceholders = roleFilter.map(() => '?').join(', ');
  const conditions: string[] = ['messages_fts MATCH ?'];
  const params: (string | number)[] = [ftsQuery];

  if (workspaceId) {
    conditions.push('fts.workspace_id = ?');
    params.push(workspaceId);
  }
  if (agentId) {
    conditions.push('fts.agent_id = ?');
    params.push(agentId);
  }
  if (sessionId) {
    conditions.push('fts.session_id = ?');
    params.push(sessionId);
  }
  conditions.push(`fts.role IN (${rolePlaceholders})`);
  params.push(...roleFilter);

  const sql = `
    SELECT
      fts.message_id,
      fts.session_id,
      fts.workspace_id,
      fts.role,
      snippet(messages_fts, 5, '...', '...', '...', 32) as snippet,
      m.created_at as timestamp,
      s.title as session_title,
      rank
    FROM messages_fts fts
    JOIN messages m ON m.id = fts.message_id
    JOIN sessions s ON s.id = fts.session_id
    WHERE ${conditions.join(' AND ')}
    ${sort === 'newest' ? 'ORDER BY m.created_at DESC' : sort === 'oldest' ? 'ORDER BY m.created_at ASC' : 'ORDER BY rank'}
    LIMIT ?
  `;
  params.push(limit);

  try {
    const rows = db.query(sql).all(...params) as Array<{
      message_id: string;
      session_id: string;
      workspace_id: string;
      role: string;
      snippet: string;
      timestamp: number;
      session_title: string | null;
      rank: number;
    }>;

    let rankCounter = 1;
    return rows.map((row) => ({
      messageId: row.message_id,
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      role: row.role,
      content: row.snippet.slice(0, MAX_SNIPPET_LENGTH),
      timestamp: row.timestamp,
      sessionTitle: row.session_title,
      rank: sort === 'relevance' ? rankCounter++ : row.rank,
    }));
  } catch {
    const plainQuery = query.replace(/["'*]/g, '').trim();
    if (!plainQuery) return [];

    const fallbackQuery = `"${plainQuery}"`;
    try {
      const rows = db.query(
        sql.replace('messages_fts MATCH ?', 'messages_fts MATCH ?'),
      ).all(fallbackQuery, ...params.slice(1)) as Array<{
        message_id: string;
        session_id: string;
        workspace_id: string;
        role: string;
        snippet: string;
        timestamp: number;
        session_title: string | null;
        rank: number;
      }>;

      let rankCounter = 1;
      return rows.map((row) => ({
        messageId: row.message_id,
        sessionId: row.session_id,
        workspaceId: row.workspace_id,
        role: row.role,
        content: row.snippet.slice(0, MAX_SNIPPET_LENGTH),
        timestamp: row.timestamp,
        sessionTitle: row.session_title,
        rank: sort === 'relevance' ? rankCounter++ : row.rank,
      }));
    } catch {
      return [];
    }
  }
}

export function sanitizeFtsQuery(input: string): string {
  let q = input.trim();
  if (!q) return '';

  const quotedPhrases: string[] = [];
  q = q.replace(/"([^"]*)"/g, (_match, content: string) => {
    if (content.trim()) {
      quotedPhrases.push(`"${content.trim()}"`);
    }
    return '';
  });

  q = q.replace(/[{}()[\]\\|~^:=!<>+*/%;]/g, ' ');

  const terms = q
    .split(/\s+/)
    .filter((t) => {
      if (!t) return false;
      const upper = t.toUpperCase();
      return !['AND', 'OR', 'NOT'].includes(upper);
    })
    .map((t) => {
      const cleaned = t.replace(/^-+/, '');
      return cleaned.replace(/-+$/, '');
    })
    .filter((t) => t.length > 0);

  const allParts = [...quotedPhrases, ...terms];

  return allParts.join(' ') || '';
}

export function getMessageContentForFts(
  messageId: string,
): { content: string; toolName: string } {
  const db = getDatabase();
  const parts = db.query(
    'SELECT type, data FROM parts WHERE message_id = ? ORDER BY created_at ASC',
  ).all(messageId) as Array<{ type: string; data: string }>;

  const textParts: string[] = [];
  const toolNames: string[] = [];

  for (const part of parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      try {
        const parsed = JSON.parse(part.data);
        if (parsed.text) textParts.push(parsed.text);
      } catch { /* skip */ }
    } else if (part.type === 'tool') {
      try {
        const parsed = JSON.parse(part.data);
        if (parsed.name) toolNames.push(parsed.name);
      } catch { /* skip */ }
    }
  }

  return {
    content: textParts.join(' '),
    toolName: toolNames.join(' '),
  };
}
