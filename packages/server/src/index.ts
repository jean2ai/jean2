globalThis.AI_SDK_LOG_WARNINGS = false;

import { createApp } from './app';
import { getPreconfig, getDefaultPreconfig } from './core/preconfig';
import { registerBroadcastCallback, broadcastSessionCreatedExclude } from './core/broadcast';
import { scanTools } from './tools';
import { closeDatabase } from './store';
import type { ServerMessage, ClientMessage, SecurityCheckResult } from '@jean2/shared';
import type { PermissionType } from '@jean2/shared';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  createMessage,
  updateMessage,
  createPart,
  listMessagesWithParts,
  addMessageToQueue,
  getQueuedMessage,
  listQueuedMessages,
  deleteQueuedMessage,
  getNextQueuedMessage,
} from '@/store';
import { getWorkspace } from '@/store/workspaces';
import { getWorkspacePermissions, revokePermission, revokeAllWorkspacePermissions } from '@/store/permissions';
import {
  createToolApproval,
  updateToolApproval,
  listPendingApprovals
} from '@/store/tool-approvals';
import { streamChat } from './core/agent';
import { getModelsConfig, findModel, getPort, getHost } from './config';
import { compactMessages } from './core/compaction';
import { revertToStep } from './core/revert';
import { forkSession } from './core/fork';
import { interruptManager } from './core/interrupt';
import type { ServerWebSocket } from 'bun';
import { validateToken, updateLastUsed, isAuthEnabled } from './auth/token';
import {
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
} from './env';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export interface ServerInstance {
  server: ReturnType<typeof Bun.serve>;
  cleanup: () => void;
}

// Store connected clients with their session info
const clients = new Map<ServerWebSocket, { sessionId?: string }>();

// Store only the resolve functions in memory (can't persist these)
// The actual permission data is stored in the database
const pendingPermissionResolvers = new Map<string, {
  resolve: (result: { allowed: boolean; alwaysAllow: boolean }) => void
}>();

function getWsForSession(sessionId: string): ServerWebSocket | undefined {
  for (const [ws, data] of clients.entries()) {
    if (data.sessionId === sessionId) {
      return ws;
    }
  }
  return undefined;
}

function broadcast(message: ServerMessage, excludeWs?: ServerWebSocket) {
  const messageStr = JSON.stringify(message);
  for (const [ws] of clients.entries()) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  }
}

async function startServer(options?: ServerOptions): Promise<ServerInstance> {
  const port = options?.port ?? getPort();
  const host = options?.host ?? getHost();

  console.log('Starting AI Agent Server...');

  // Register broadcast callback for other modules
  registerBroadcastCallback(broadcast as (message: ServerMessage, excludeWs?: unknown) => void);

  // Check available API keys
  const availableProviders: string[] = [];
  if (getLLMOpenAIApiKey()) availableProviders.push('openai');
  if (getLLMAnthropicApiKey()) availableProviders.push('anthropic');
  if (getLLMOpenRouterApiKey()) availableProviders.push('openrouter');
  if (getLLMGoogleApiKey()) availableProviders.push('google');
  if (getLLMMinimaxApiKey()) availableProviders.push('minimax');
  if (getLLMZhipuApiKey()) availableProviders.push('zhipu');
  if (getLLMZhipuCodingApiKey()) availableProviders.push('zhipu-coding');

  if (availableProviders.length > 0) {
    console.log(`Available providers: ${availableProviders.join(', ')}`);
  } else {
    console.warn('WARNING: No LLM API keys configured. Chat will not work.');
    console.warn('Set at least one of: JEAN2_LLM_OPENAI_API_KEY, JEAN2_LLM_ANTHROPIC_API_KEY, JEAN2_LLM_OPENROUTER_API_KEY, JEAN2_LLM_GOOGLE_API_KEY, JEAN2_LLM_MINIMAX_API_KEY');
  }

  // Scan for tools
  console.log('Scanning for tools...');
  const tools = await scanTools();
  console.log(`Found ${tools.length} tools: ${tools.map(t => t.definition.name).join(', ')}`);

  // Create the app
  const app = createApp();

  console.log(`Server starting on http://${host}:${port}`);

  const server = Bun.serve({
    port,
    hostname: host,

    async fetch(req: Request): Promise<Response | undefined> {
      const url = new URL(req.url);

      // Handle WebSocket upgrade
      if (url.pathname === '/ws') {
        // Validate token before upgrading
        if (isAuthEnabled()) {
          const token = url.searchParams.get('token');

          if (!token || !validateToken(token)) {
            return new Response(
              JSON.stringify({
                error: 'Unauthorized',
                message: 'Invalid or missing API token for WebSocket connection'
              }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }

          updateLastUsed();
        }

        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
        return undefined;
      }

      // Handle API requests with Hono
      return app.fetch(req);
    },

    websocket: {
      open(ws: ServerWebSocket) {
        clients.set(ws, {});
        console.log('Client connected. Total clients:', clients.size);
      },

      close(ws: ServerWebSocket) {
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
      },

      async message(ws: ServerWebSocket, message: string | Buffer) {
        try {
          const msg: ClientMessage = JSON.parse(message.toString());
          await handleClientMessage(ws, msg);
        } catch (err) {
          console.error('WebSocket message error:', err);
          ws.send(JSON.stringify({ type: 'error', code: 'parse_error', message: String(err) }));
        }
      },
    },
  });

  console.log(`AI Agent Server running at http://${host}:${port}`);

  // Setup signal handlers for graceful shutdown
  const onShutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', () => onShutdown('SIGTERM'));
  process.on('SIGINT', () => onShutdown('SIGINT'));

  const cleanup = () => {
    server.stop();
    closeDatabase();
    // Remove listeners to prevent duplicate calls
    process.removeListener('SIGTERM', onShutdown);
    process.removeListener('SIGINT', onShutdown);
  };

  return { server, cleanup };
}

function send(ws: ServerWebSocket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

// Centralized permission handler that routes to parent session for subagents
function createPermissionRequestHandler(sessionId: string) {
  return async (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    securityResult: SecurityCheckResult
  ): Promise<{ allowed: boolean; alwaysAllow: boolean }> => {
    const session = getSession(sessionId);

    // Find root parent session (for subagents)
    let parentSessionId = sessionId;
    let currentSession = session;
    while (currentSession?.parentId) {
      parentSessionId = currentSession.parentId;
      currentSession = getSession(parentSessionId);
    }

    const clientWs = getWsForSession(parentSessionId);

    if (!clientWs) {
      return { allowed: false, alwaysAllow: false };
    }

    // Determine subagent name if this is a subagent session
    let subagentName: string | undefined;
    if (session?.parentId) {
      // Extract agent name from title (format: "Task (subagent@claude)")
      const titleParts = session.title?.split('(');
      if (titleParts && titleParts.length > 1) {
        const agentPart = titleParts[1].split('@')[1]?.split(' ')[0];
        if (agentPart) {
          subagentName = agentPart;
        }
      }
      if (!subagentName) {
        subagentName = 'subagent';
      }
    }

    // Send permission request to parent session
    send(clientWs, {
      type: 'permission.request',
      sessionId: parentSessionId,
      childSessionId: sessionId !== parentSessionId ? sessionId : undefined,
      subagentName,
      toolCallId,
      toolName,
      args,
      permissionType: securityResult.permissionType,
      permissionKey: securityResult.permissionKey,
      message: securityResult.message,
      details: securityResult.details,
    });

    // Store the approval in database
    createToolApproval({
      id: toolCallId,
      sessionId: parentSessionId,
      childSessionId: sessionId !== parentSessionId ? sessionId : undefined,
      subagentName,
      toolCallId,
      toolName,
      args,
      permissionType: securityResult.permissionType,
      permissionKey: securityResult.permissionKey,
      message: securityResult.message,
      details: securityResult.details,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });

    return new Promise((resolve) => {
      // Store only the resolve function in memory
      pendingPermissionResolvers.set(toolCallId, { resolve });

      // 5 minute timeout
      setTimeout(() => {
        const pending = pendingPermissionResolvers.get(toolCallId);
        if (pending) {
          pendingPermissionResolvers.delete(toolCallId);
          // Update database status to timeout
          updateToolApproval(toolCallId, {
            status: 'timeout',
            respondedAt: new Date().toISOString()
          });
          resolve({ allowed: false, alwaysAllow: false });
        }
      }, 5 * 60 * 1000);
    });
  };
}

async function handleClientMessage(ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'session.create': {
      const session = createSession({
        id: crypto.randomUUID(),
        workspaceId: msg.workspaceId || '',
        preconfigId: msg.preconfigId || null,
        title: msg.title || 'New Session',
        status: 'active',
        metadata: null,
        parentId: null,
        agentName: null,
      });
      clients.set(ws, { sessionId: session.id });
      send(ws, { type: 'session.created', session });
      broadcastSessionCreatedExclude(session, ws);
      break;
    }

    case 'session.resume': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      clients.set(ws, { sessionId: session.id });

      // Get full conversation state
      const messages = listMessagesWithParts(session.id);

      // Check if the session is currently active/running
      const isRunning = interruptManager.isSessionActive(session.id);

      send(ws, {
        type: 'session.resumed',
        session,
        messages,
        usage: session.totalTokens ? {
          promptTokens: session.promptTokens ?? 0,
          completionTokens: session.completionTokens ?? 0,
          totalTokens: session.totalTokens ?? 0,
        } : undefined,
        isRunning,
      });

      // Send any pending permission requests for this session from database
      const pendingApprovals = listPendingApprovals(msg.sessionId);

      for (const approval of pendingApprovals) {
        send(ws, {
          type: 'permission.request',
          sessionId: approval.sessionId,
          childSessionId: approval.childSessionId,
          subagentName: approval.subagentName,
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          args: approval.args,
          permissionType: (approval.permissionType || 'tool') as PermissionType,
          permissionKey: approval.permissionKey || '',
          message: approval.message || '',
          details: approval.details,
        });
      }

      // Send queued messages
      const queuedMessages = listQueuedMessages(msg.sessionId);
      if (queuedMessages.length > 0) {
        send(ws, {
          type: 'queue.list',
          sessionId: msg.sessionId,
          messages: queuedMessages,
        });
      }
      break;
    }

    case 'session.update': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updates: { preconfigId?: string } = {};
      if (msg.preconfigId !== undefined) {
        updates.preconfigId = msg.preconfigId;
      }
      const updated = updateSession(msg.sessionId, updates);
      send(ws, { type: 'session.updated', session: updated! });
      break;
    }

    case 'session.update_model': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updated = updateSession(msg.sessionId, {
        selectedModel: msg.modelId,
        selectedProvider: msg.providerId
      });
      send(ws, { type: 'session.updated', session: updated! });
      break;
    }

    case 'session.close': {
      updateSession(msg.sessionId, { status: 'closed' });
      send(ws, { type: 'session.closed', sessionId: msg.sessionId });
      break;
    }

    case 'session.reopen': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const updated = updateSession(msg.sessionId, { status: 'active' });
      send(ws, { type: 'session.reopened', session: updated! });
      break;
    }

    case 'session.delete': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      deleteSession(msg.sessionId);
      send(ws, { type: 'session.deleted', sessionId: msg.sessionId });
      break;
    }

    case 'session.rename': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const trimmedTitle = msg.title?.trim() ?? '';
      if (!trimmedTitle) {
        send(ws, { type: 'error', code: 'invalid_title', message: 'Title cannot be empty' });
        break;
      }
      const updatedSession = updateSession(msg.sessionId, { title: trimmedTitle });
      broadcast({ type: 'session.renamed', session: updatedSession! });
      break;
    }

    case 'chat.message': {
      await handleChat(ws, msg.sessionId, msg.content);
      break;
    }

    case 'permission.response': {
      const pending = pendingPermissionResolvers.get(msg.toolCallId);
      if (pending) {
        pendingPermissionResolvers.delete(msg.toolCallId);

        // Update database with the response
        updateToolApproval(msg.toolCallId, {
          status: msg.allowed ? 'approved' : 'denied',
          respondedAt: new Date().toISOString(),
        });

        // Resolve the promise
        pending.resolve({ allowed: msg.allowed, alwaysAllow: msg.alwaysAllow });
      } else {
        console.warn('permission.response received for unknown toolCallId:', msg.toolCallId);
      }
      break;
    }

    case 'permission.list': {
      const permissions = getWorkspacePermissions(msg.workspaceId, msg.includeRevoked);
      send(ws, { type: 'permission.list', workspaceId: msg.workspaceId, permissions });
      break;
    }

    case 'permission.revoke': {
      revokePermission(msg.permissionId, null);
      send(ws, { type: 'permission.revoked', permissionId: msg.permissionId });
      break;
    }

    case 'permission.revoke_all': {
      const count = revokeAllWorkspacePermissions(msg.workspaceId, null);
      send(ws, { type: 'permission.all_revoked', workspaceId: msg.workspaceId, count });
      break;
    }

    case 'session.compact': {
      await handleSessionCompact(ws, msg);
      break;
    }

    case 'session.revert': {
      await handleSessionRevert(ws, msg);
      break;
    }

    case 'session.fork': {
      await handleSessionFork(ws, msg);
      break;
    }

    case 'session.interrupt': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }

      try {
        const result = await interruptManager.interruptSession(
          msg.sessionId,
          msg.reason || 'user_request'
        );

        broadcast({
          type: 'session.interrupted',
          sessionId: msg.sessionId,
          result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Interrupt failed';
        send(ws, { type: 'error', code: 'interrupt_error', message });
      }
      break;
    }

    case 'queue.add': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }

      if (!msg.content || !msg.content.trim()) {
        send(ws, { type: 'error', code: 'invalid_content', message: 'Content cannot be empty' });
        return;
      }

      const queuedMessage = addMessageToQueue(msg.sessionId, msg.content);
      clients.set(ws, { sessionId: msg.sessionId });

      send(ws, {
        type: 'queue.added',
        sessionId: msg.sessionId,
        message: queuedMessage,
      });
      break;
    }

    case 'queue.remove': {
      const queuedMsg = getQueuedMessage(msg.queueId);
      if (!queuedMsg) {
        send(ws, { type: 'error', code: 'not_found', message: 'Queued message not found' });
        return;
      }

      deleteQueuedMessage(msg.queueId);

      send(ws, {
        type: 'queue.removed',
        sessionId: queuedMsg.sessionId,
        queueId: msg.queueId,
      });
      break;
    }

    default:
      send(ws, { type: 'error', code: 'unknown_message', message: 'Unknown message type' });
  }
}

async function handleSessionCompact(
  ws: ServerWebSocket,
  msg: { sessionId: string; messageIds: string[] }
) {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
      return;
    }

    const result = await compactMessages({
      sessionId: msg.sessionId,
      messageIds: msg.messageIds,
    });

    broadcast({
      type: 'part.created',
      sessionId: msg.sessionId,
      part: result.compactionPart,
    });

    send(ws, {
      type: 'compaction.complete',
      sessionId: msg.sessionId,
      compactedCount: msg.messageIds.length,
      tokensUsed: result.tokensUsed,
    });

    // Persist compaction tokens to database
    const currentSession = getSession(msg.sessionId);
    if (currentSession) {
      updateSession(msg.sessionId, {
        promptTokens: result.tokensUsed.prompt,
        completionTokens: result.tokensUsed.completion,
        totalTokens: result.tokensUsed.prompt + result.tokensUsed.completion,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compaction failed';
    send(ws, { type: 'error', code: 'compaction_error', message });
  }
}

async function handleSessionRevert(
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string }
) {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
      return;
    }

    const result = await revertToStep({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
    });

    broadcast({
      type: 'session.reverted',
      sessionId: msg.sessionId,
      revertedTo: result.revertedTo,
      removed: result.removed,
    });

    const currentState = listMessagesWithParts(msg.sessionId);
    broadcast({
      type: 'session.state',
      sessionId: msg.sessionId,
      messages: currentState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Revert failed';
    send(ws, { type: 'error', code: 'revert_error', message });
  }
}

async function handleSessionFork(
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string; title?: string }
) {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
      return;
    }

    const result = await forkSession({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
      title: msg.title,
    });

    broadcast({
      type: 'session.forked',
      originalSessionId: msg.sessionId,
      forkedSession: result.forkedSession,
      messages: result.messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fork failed';
    send(ws, { type: 'error', code: 'fork_error', message });
  }
}

async function processQueueAfterStream(ws: ServerWebSocket, sessionId: string): Promise<void> {
  const nextMsg = getNextQueuedMessage(sessionId);

  if (!nextMsg) {
    return;
  }

  // Notify client that we're sending this queued message
  broadcast({
    type: 'queue.sending',
    sessionId,
    queueId: nextMsg.id,
  });

  // Remove from queue before sending (to prevent double-send on error)
  deleteQueuedMessage(nextMsg.id);

  // Send the message (this will trigger a new stream)
  await handleChat(ws, sessionId, nextMsg.content);
}

async function handleChat(ws: ServerWebSocket, sessionId: string, content: string) {
  const session = getSession(sessionId);
  if (!session) {
    send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }

  // Prevent sending messages to closed/archived sessions
  if (session.status === 'closed') {
    send(ws, { type: 'error', code: 'session_closed', message: 'Cannot send messages to an archived session. Reopen it first.' });
    return;
  }

  // Get workspace path for tool execution
  const workspace = session.workspaceId ? getWorkspace(session.workspaceId) : null;
  const workspacePath = workspace?.path;

  // Get preconfig (for default model)
  const preconfig = session.preconfigId
    ? await getPreconfig(session.preconfigId)
    : await getDefaultPreconfig();

  if (!preconfig) {
    send(ws, { type: 'error', code: 'no_preconfig', message: 'No preconfig found' });
    return;
  }

  // Get the default model from config
  const config = getModelsConfig();
  const configDefaultModel = config.defaultModel;

  // Determine which model and provider will be used
  const modelId = session.selectedModel || preconfig?.model || configDefaultModel;
  const provider = session.selectedProvider ||
                  (preconfig?.model ? findProviderFromModel(preconfig.model) : null) ||
                  config.defaultProvider;

  // Helper function to find provider from model
  function findProviderFromModel(m: string): string {
    const modelInfo = findModel(m);
    if (modelInfo) return modelInfo.providerId;
    if (m.includes('/')) return 'openrouter';
    if (m.startsWith('claude-')) return 'anthropic';
    if (m.startsWith('gemini-')) return 'google';
    return 'openai';
  }

  // Check API key
  type Provider = 'openai' | 'anthropic' | 'openrouter' | 'google' | 'minimax' | 'zhipu' | 'zhipu-coding';
  const apiKeyGetterMap: Record<Provider, () => string | undefined> = {
    'openai': getLLMOpenAIApiKey,
    'anthropic': getLLMAnthropicApiKey,
    'openrouter': getLLMOpenRouterApiKey,
    'google': getLLMGoogleApiKey,
    'minimax': getLLMMinimaxApiKey,
    'zhipu': getLLMZhipuApiKey,
    'zhipu-coding': getLLMZhipuCodingApiKey,
  };
  const apiKeyGetter = apiKeyGetterMap[provider as Provider];
  const apiKey = apiKeyGetter ? apiKeyGetter() : undefined;

  if (!apiKey) {
    const envKey = `JEAN2_LLM_${provider.toUpperCase()}_API_KEY`;
    send(ws, { type: 'error', code: 'no_api_key', message: `No API key configured for provider: ${provider}. Set ${envKey}` });
    return;
  }

  // Create user message FIRST (before loading history)
  const userMsgId = crypto.randomUUID();

  // Create user message in DB
  const userMessage = {
    id: userMsgId,
    sessionId,
    role: 'user' as const,
    createdAt: Date.now(),
  };
  createMessage(userMessage);

  // Create text part for user message
  const textPartId = crypto.randomUUID();
  const textPart = {
    id: textPartId,
    messageId: userMsgId,
    createdAt: Date.now(),
    type: 'text' as const,
    text: content,
  };
  createPart(textPart, sessionId);

  // Send user message and part to client
  broadcast({ type: 'message.created', message: userMessage });
  broadcast({ type: 'part.created', sessionId, part: textPart });

  // Get message history (NOW as MessageWithParts)
  const history = listMessagesWithParts(sessionId);

  // Permission request callback - routes to parent session for subagents
  const onPermissionRequest = createPermissionRequestHandler(sessionId);

  try {
    // Stream the response - agent now handles all message/part creation
    for await (const event of streamChat({
      sessionId,
      preconfig,
      messages: history,
      onPermissionRequest,
      modelId: modelId,
      providerId: provider,
      workspacePath,
      workspaceId: session.workspaceId || undefined,
    })) {
      // Relay all events directly to client
      switch (event.type) {
        case 'message.created':
          broadcast(event);
          break;

        case 'message.updated':
          // Persist the message update to database (status, tokens, etc.)
          updateMessage(event.message.id, event.message);
          broadcast(event);
          break;

        case 'part.created':
          broadcast(event);
          break;

        case 'part.updated':
          broadcast(event);
          break;

        case 'part.append':
          broadcast(event);
          break;

        case 'usage': {
          broadcast({
            type: 'chat.usage',
            sessionId,
            usage: event.usage,
            model: event.model,
          });
          // Persist usage to database
          const currentSession = getSession(sessionId);
          if (currentSession) {
            updateSession(sessionId, {
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              totalTokens: event.usage.totalTokens,
            });
          }
          break;
        }
      }
    }

    // Process queue after successful stream
    await processQueueAfterStream(ws, sessionId);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    console.error('Chat error:', err);
    send(ws, { type: 'error', code: 'chat_error', message });
  }
}

// Run server when file is executed directly
if (import.meta.main) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { createPermissionRequestHandler, startServer };
