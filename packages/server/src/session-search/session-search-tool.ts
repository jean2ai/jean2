import { searchMessages, getMessageContentForFts } from './fts';
import { getDatabase, getSession, getWorkspace } from '@/store';
import type { PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';

export const sessionSearchToolDefinition = {
  name: 'session_search',
  description: `Search prior conversation messages from the current workspace or current session archive.
Use it to recall past work, find earlier discussions, or retrieve details that may have been compacted away from active context.
Two modes:
1. Search mode (provide "query"): Full-text search across messages.
2. Read-around mode (provide "sessionId" + "aroundMessageId", no "query"): Read messages surrounding a specific message.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
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
        description: 'Session ID for read-around mode. The target session must belong to the current workspace.',
      },
      aroundMessageId: {
        type: 'string' as const,
        description: 'Anchor message ID for read-around mode. Returns surrounding messages.',
      },
      limit: {
        type: 'number' as const,
        description: 'Max results for search mode. Default 5, max 20.',
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

export interface SessionSearchResult {
  success: boolean;
  mode: 'search' | 'read';
  title: string;
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

  if (sessionId && aroundMessageId) {
    return executeReadAround(sessionId, aroundMessageId, workspaceId, input);
  }

  return { success: false, mode: 'search', title: 'Invalid arguments', error: 'Provide "query" for search mode, or "sessionId" + "aroundMessageId" for read-around mode.' };
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
  anchorMessageId: string,
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

  const anchor = db.query('SELECT * FROM messages WHERE id = ? AND session_id = ?').get(anchorMessageId, targetSessionId) as {
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
    anchorMessageId,
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
    title: 'Read session context',
    sessionId: targetSessionId,
    sessionTitle: session.title,
    anchorMessageId,
    messagesBefore: beforeCount,
    messagesAfter: afterCount,
    messages,
  };
}
