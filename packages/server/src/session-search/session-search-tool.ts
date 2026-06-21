import { searchMessages, getMessageContentForFts } from './fts';
import { getDatabase, getSession, getWorkspace, listSessionsByWorkspace } from '@/store';
import type { PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';

export const sessionSearchToolDefinition = {
  name: 'session_search',
  description: `Search prior conversation messages, list recent sessions, or read session context from the current workspace.
Use it to recall past work, find earlier discussions, or retrieve details that may have been compacted away from active context.
Three modes:
1. List mode (provide "action": "list"): List recent sessions in the workspace with their IDs, titles, and message counts. Use this to discover what sessions exist before reading.
2. Search mode (provide "query"): Full-text search across messages in the workspace or current session.
3. Read-around mode (provide "sessionId", optionally "aroundMessageId"): Read messages surrounding a specific message. If "aroundMessageId" is omitted, reads the latest messages in that session.

Typical workflow: list sessions → read a session's latest context → search for specific keywords if needed.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['list', 'search', 'read'],
        description: 'The action to perform. "list": enumerate recent sessions. "search": full-text search (default if query provided). "read": read session context. Defaults to "search" if query is provided, "read" if sessionId is provided.',
      },
      query: {
        type: 'string' as const,
        description: 'Search query for full-text search. Triggers search mode.',
      },
      scope: {
        type: 'string' as const,
        enum: ['current_session', 'workspace'],
        description: 'Search scope. "current_session" searches only the current session archive. "workspace" searches all sessions in the workspace. Defaults to "workspace".',
      },
      sessionId: {
        type: 'string' as const,
        description: 'Session ID for read-around mode. Use "list" action first to discover session IDs. The target session must belong to the current workspace.',
      },
      aroundMessageId: {
        type: 'string' as const,
        description: 'Anchor message ID for read-around mode. Returns surrounding messages. If omitted, reads the latest messages in the session.',
      },
      limit: {
        type: 'number' as const,
        description: 'Max results for search mode, or max sessions for list mode. Default 5, max 20.',
      },
      window: {
        type: 'number' as const,
        description: 'Number of messages to return around the anchor in read-around mode. Default 8, max 25.',
      },
      roleFilter: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['user', 'assistant', 'tool'],
        },
        description: 'Roles to include in results. Defaults to ["user", "assistant"] unless workspace includes tool results.',
      },
      sort: {
        type: 'string' as const,
        enum: ['relevance', 'newest', 'oldest'],
        description: 'Sort order for search results. Defaults to "relevance".',
      },
    },
  },
  timeout: 15000,
};

const MAX_CONTENT_LENGTH = 2000;

export interface SessionListEntry {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface SessionSearchResult {
  success: boolean;
  mode: 'list' | 'search' | 'read';
  title: string;
  sessions?: SessionListEntry[];
  query?: string;
  scope?: string;
  results?: Array<{
    sessionId: string;
    sessionTitle: string | null;
    messageId: string;
    role: string;
    timestamp: number;
    snippet: string;
    rank: number;
    messagesBefore: number;
    messagesAfter: number;
  }>;
  sessionId?: string;
  sessionTitle?: string | null;
  anchorMessageId?: string;
  anchorInferred?: boolean;
  messagesBefore?: number;
  messagesAfter?: number;
  messages?: Array<{
    id: string;
    role: string;
    timestamp: number;
    content: string;
  }>;
  error?: string;
}

export async function executeSessionSearchTool(
  input: Record<string, unknown>,
  workspaceId: string,
  currentSessionId: string,
  includeToolResults: boolean,
  permissionRisk: PermissionRiskLevel,
  askFn?: (ask: PermissionAsk) => Promise<unknown>,
): Promise<SessionSearchResult> {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return { success: false, mode: 'search', title: 'Workspace not found', error: 'Workspace not found' };
  }

  const query = input.query as string | undefined;
  const scope = (input.scope as string) || 'workspace';
  const sessionId = input.sessionId as string | undefined;
  const aroundMessageId = input.aroundMessageId as string | undefined;

  const action = (input.action as string) || (query ? 'search' : sessionId ? 'read' : 'search');

  // `list` is read-only metadata — no message content exposed
  if (action === 'list') {
    return executeList(workspaceId, currentSessionId, input);
  }

  if (permissionRisk !== 'none' && askFn) {
    const ask: PermissionAsk = {
      type: 'permission',
      question: query
        ? `Allow searching workspace sessions for "${query.slice(0, 100)}"?`
        : 'Allow reading session context?',
      description: `Tool: session_search\nWorkspace: ${workspace.name}${query ? `\nQuery: ${query.slice(0, 200)}` : ''}\nScope: ${scope}`,
      risk: permissionRisk,
      resource: 'session',
      action: 'read',
    };
    const approved = await askFn(ask);
    if (!approved) {
      return { success: false, mode: 'search', title: 'Permission denied', error: 'USER_REJECTION' };
    }
  }

  if (query) {
    return executeSearch(query, scope, workspaceId, currentSessionId, includeToolResults, input);
  }

  if (sessionId) {
    return executeReadAround(sessionId, aroundMessageId, workspaceId, input);
  }

  return { success: false, mode: 'search', title: 'Invalid arguments', error: 'Provide "action": "list" to enumerate sessions, "query" for search mode, or "sessionId" for read-around mode.' };
}

function executeList(
  workspaceId: string,
  currentSessionId: string,
  input: Record<string, unknown>,
): SessionSearchResult {
  const limit = Math.min(Math.max((input.limit as number) || 10, 1), 20);
  const db = getDatabase();

  // Get root sessions (exclude subagent child sessions) ordered by most recently updated
  const sessions = listSessionsByWorkspace(workspaceId, { rootOnly: true });
  const limited = sessions.slice(0, limit);

  if (limited.length === 0) {
    return {
      success: true,
      mode: 'list',
      title: 'No sessions found',
      sessions: [],
    };
  }

  const entries: SessionListEntry[] = limited.map((s) => {
    const msgCount = (db.query(
      'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?',
    ).get(s.id) as { cnt: number }).cnt;

    return {
      id: s.id,
      title: s.title || '(untitled)',
      messageCount: msgCount,
      updatedAt: s.updatedAt,
      ...(s.id === currentSessionId && { isCurrent: true }),
    } as SessionListEntry & { isCurrent?: boolean };
  });

  return {
    success: true,
    mode: 'list',
    title: `${sessions.length} session${sessions.length === 1 ? '' : 's'} in workspace`,
    sessions: entries,
  };
}

function executeSearch(
  query: string,
  scope: string,
  workspaceId: string,
  currentSessionId: string,
  includeToolResults: boolean,
  input: Record<string, unknown>,
): SessionSearchResult {
  const limit = Math.min(Math.max((input.limit as number) || 5, 1), 20);
  const sort = (input.sort as string) || 'relevance';

  let roleFilter = (input.roleFilter as string[]) || undefined;
  if (!roleFilter) {
    roleFilter = includeToolResults ? ['user', 'assistant', 'tool'] : ['user', 'assistant'];
  }
  const allowedRoles = ['user', 'assistant', 'tool'];
  roleFilter = roleFilter.filter((r) => allowedRoles.includes(r));
  if (roleFilter.length === 0) {
    roleFilter = ['user', 'assistant'];
  }

  const targetSessionId = scope === 'current_session' ? currentSessionId : undefined;

  const results = searchMessages({
    query,
    workspaceId,
    sessionId: targetSessionId,
    roleFilter,
    limit,
    sort: sort as 'relevance' | 'newest' | 'oldest',
  });

  if (results.length === 0) {
    return {
      success: true,
      mode: 'search',
      title: 'No prior context found',
      query,
      scope,
      results: [],
    };
  }

  const db = getDatabase();

  const mappedResults = results.map((r) => {
    const before = (db.query(
      'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND created_at < ?',
    ).get(r.sessionId, r.timestamp) as { cnt: number }).cnt;

    const after = (db.query(
      'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND created_at > ?',
    ).get(r.sessionId, r.timestamp) as { cnt: number }).cnt;

    return {
      sessionId: r.sessionId,
      sessionTitle: r.sessionTitle,
      messageId: r.messageId,
      role: r.role,
      timestamp: r.timestamp,
      snippet: r.content,
      rank: r.rank,
      messagesBefore: before,
      messagesAfter: after,
    };
  });

  return {
    success: true,
    mode: 'search',
    title: `Searched ${scope === 'current_session' ? 'current session' : 'workspace sessions'}`,
    query,
    scope,
    results: mappedResults,
  };
}

function executeReadAround(
  targetSessionId: string,
  anchorMessageId: string | undefined,
  workspaceId: string,
  input: Record<string, unknown>,
): SessionSearchResult {
  const db = getDatabase();

  const session = getSession(targetSessionId);
  if (!session) {
    return { success: false, mode: 'read', title: 'Session not found', error: 'Session not found' };
  }

  if (session.workspaceId !== workspaceId) {
    return { success: false, mode: 'read', title: 'Access denied', error: 'Session does not belong to current workspace' };
  }

  // If no anchor provided, infer the latest message in the session
  let inferredAnchor = false;
  let effectiveAnchorId: string;

  if (anchorMessageId) {
    effectiveAnchorId = anchorMessageId;
  } else {
    const latest = db.query(
      'SELECT id, created_at FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(targetSessionId) as { id: string; created_at: number } | undefined;

    if (!latest) {
      return { success: false, mode: 'read', title: 'Empty session', error: 'Session has no messages' };
    }

    effectiveAnchorId = latest.id;
    inferredAnchor = true;
  }

  const anchor = db.query('SELECT * FROM messages WHERE id = ? AND session_id = ?').get(effectiveAnchorId, targetSessionId) as {
    id: string;
    created_at: number;
  } | undefined;

  if (!anchor) {
    return { success: false, mode: 'read', title: 'Message not found', error: 'Anchor message not found in session' };
  }

  const window = Math.min(Math.max((input.window as number) || 8, 1), 25);
  const halfWindow = Math.floor(window / 2);

  const messagesBefore = db.query(
    'SELECT id, role, created_at FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
  ).all(targetSessionId, anchor.created_at, halfWindow) as Array<{
    id: string;
    role: string;
    created_at: number;
  }>;

  const messagesAfter = db.query(
    'SELECT id, role, created_at FROM messages WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?',
  ).all(targetSessionId, anchor.created_at, halfWindow) as Array<{
    id: string;
    role: string;
    created_at: number;
  }>;

  const allIds = [
    ...messagesBefore.reverse().map((m) => m.id),
    effectiveAnchorId,
    ...messagesAfter.map((m) => m.id),
  ];

  const messages: Array<{
    id: string;
    role: string;
    timestamp: number;
    content: string;
  }> = [];

  for (const id of allIds) {
    const { content, toolName } = getMessageContentForFts(id);
    const msgRow = db.query('SELECT role, created_at FROM messages WHERE id = ?').get(id) as {
      role: string;
      created_at: number;
    } | undefined;
    if (!msgRow) continue;

    let text = content;
    if (toolName) {
      text = text ? `${text} [tool: ${toolName}]` : `[tool: ${toolName}]`;
    }
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.slice(0, MAX_CONTENT_LENGTH) + '...';
    }

    messages.push({
      id,
      role: msgRow.role,
      timestamp: msgRow.created_at,
      content: text || '(no text content)',
    });
  }

  const beforeCount = (db.query(
    'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND created_at < ?',
  ).get(targetSessionId, anchor.created_at) as { cnt: number }).cnt;

  const afterCount = (db.query(
    'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND created_at > ?',
  ).get(targetSessionId, anchor.created_at) as { cnt: number }).cnt;

  return {
    success: true,
    mode: 'read',
    title: inferredAnchor ? 'Read latest session context' : 'Read session context',
    sessionId: targetSessionId,
    sessionTitle: session.title,
    anchorMessageId: effectiveAnchorId,
    ...(inferredAnchor && { anchorInferred: true }),
    messagesBefore: beforeCount,
    messagesAfter: afterCount,
    messages,
  };
}
