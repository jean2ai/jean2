globalThis.AI_SDK_LOG_WARNINGS = false;

import { readFileSync } from 'fs';

import { createApp } from '@/app';
import { getPreconfig, getDefaultPreconfig } from '@/core/preconfig';
import { registerBroadcastCallback, broadcastSessionCreatedExclude } from '@/core/broadcast';
import { scanTools } from '@/tools';
import { closeDatabase } from '@/store';
import type { ServerMessage, ClientMessage, AskResponseMessage, Ask } from '@jean2/sdk';
import { resolveAsk, listPendingAsksByRootSession, ASK_TIMEOUT, type AskBroadcastFn } from '@/tools/ask-user-api';
import { getTerminalManager, getTerminalEventManager, encodeFrame, OPCODES } from '@/services/terminal';
import { cleanupRunningSessionsOnStartup } from '@/store/terminal-sessions';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  createMessage,
  updateMessage,
  createPart,
  listMessagesWithParts,
  buildEffectiveContextHistory,
  addMessageToQueue,
  getQueuedMessage,
  listQueuedMessages,
  deleteQueuedMessage,
  getNextQueuedMessage,
  reconcileSessionCompaction,
  reconcileAllSessionsCompaction,
  reconcileAllOrphanedToolCalls,
  reconcileOrphanedToolCalls,
  getAttachment,
  listAllPendingAsks,
  cleanupAllPendingAsks,
} from '@/store';
import { getWorkspace } from '@/store/workspaces';
import { getWorkspaceGrants, revokeGrant, revokeAllWorkspaceGrants } from '@/store/permissions';
import { streamChatWithRetry } from '@/core/retry';
import { getModelsConfig, findModel, getPort, getHost } from '@/config';
import { executeCompaction } from '@/core/compaction-executor';
import { revertToStep } from '@/core/revert';
import { forkSession } from '@/core/fork';
import { interruptManager } from '@/core/interrupt';
import type { ServerWebSocket } from 'bun';
import { validateToken, updateLastUsed, isAuthEnabled } from '@/auth/token';

interface WsData {
  path: string;
  params?: Record<string, string>;
}
import {
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
  getTlsEnabled,
  getTlsCertFile,
  getTlsKeyFile,
} from '@/env';
import * as providerManager from '@/providers';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export interface ServerInstance {
  server: ReturnType<typeof Bun.serve>;
  cleanup: () => void;
}

const clients = new Map<ServerWebSocket, { sessionId?: string; missedPings: number }>();

const compactionFailureTracker = new Map<string, { count: number; lastFailureAt: number }>();
const COMPACTION_FAILURE_COOLDOWN_MS = 60_000;
const COMPACTION_MAX_CONSECUTIVE_FAILURES = 2;

function shouldSkipCompaction(sessionId: string): boolean {
  const tracker = compactionFailureTracker.get(sessionId);
  if (!tracker) return false;

  const elapsed = Date.now() - tracker.lastFailureAt;
  if (elapsed > COMPACTION_FAILURE_COOLDOWN_MS) {
    compactionFailureTracker.delete(sessionId);
    return false;
  }

  return tracker.count >= COMPACTION_MAX_CONSECUTIVE_FAILURES;
}

function recordCompactionFailure(sessionId: string): void {
  const existing = compactionFailureTracker.get(sessionId);
  if (existing) {
    existing.count++;
    existing.lastFailureAt = Date.now();
  } else {
    compactionFailureTracker.set(sessionId, { count: 1, lastFailureAt: Date.now() });
  }
}

function clearCompactionFailure(sessionId: string): void {
  compactionFailureTracker.delete(sessionId);
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
  cleanupRunningSessionsOnStartup();
  reconcileAllSessionsCompaction();
  reconcileAllOrphanedToolCalls();
  cleanupAllPendingAsks();

  const port = options?.port ?? getPort();
  const host = options?.host ?? getHost();

  console.log('Starting AI Agent Server...');

  registerBroadcastCallback(broadcast as (message: ServerMessage, excludeWs?: unknown) => void);

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

  console.log('Scanning for tools...');
  const tools = await scanTools();
  console.log(`Found ${tools.length} tools: ${tools.map(t => t.definition.name).join(', ')}`);

  const app = createApp();

  let tls: { cert: string; key: string } | undefined;
  if (getTlsEnabled()) {
    const certPath = getTlsCertFile();
    const keyPath = getTlsKeyFile();
    if (!certPath || !keyPath) {
      console.error('ERROR: JEAN2_TLS_ENABLED is set but JEAN2_TLS_CERT_FILE and/or JEAN2_TLS_KEY_FILE are not configured.');
      process.exit(1);
    }
    try {
      tls = { cert: readFileSync(certPath, 'utf-8'), key: readFileSync(keyPath, 'utf-8') };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ERROR: Failed to read TLS certificate/key files: ${message}`);
      process.exit(1);
    }
  }
  const protocol = tls ? 'https' : 'http';

  console.log(`Server starting on ${protocol}://${host}:${port}`);

  const server = Bun.serve({
    port,
    hostname: host,
    ...(tls && { tls }),

    async fetch(req: Request): Promise<Response | undefined> {
      const url = new URL(req.url);

      if (url.pathname === '/ws/terminal/events') {
        if (isAuthEnabled()) {
          const token = url.searchParams.get('token');
          if (!token || !validateToken(token)) {
            return new Response(
              JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API token' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
          }
          updateLastUsed();
        }

        const workspaceId = url.searchParams.get('workspaceId') || '';
        if (!workspaceId) {
          return new Response(
            JSON.stringify({ error: 'bad_request', message: 'Missing required parameter: workspaceId' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const upgraded = server.upgrade(req, {
          data: { path: '/ws/terminal/events', params: { workspaceId } } as unknown as undefined,
        });
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
        return undefined;
      }

      if (url.pathname === '/ws/terminal') {
        if (isAuthEnabled()) {
          const token = url.searchParams.get('token');
          if (!token || !validateToken(token)) {
            return new Response(
              JSON.stringify({
                error: 'Unauthorized',
                message: 'Invalid or missing API token for terminal connection',
              }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          updateLastUsed();
        }

        const cwd = url.searchParams.get('cwd');
        const workspaceId = url.searchParams.get('workspaceId') || 'default';
        const shell = url.searchParams.get('shell') || undefined;
        const sessionId = url.searchParams.get('sessionId') || undefined;

        if (!cwd || !workspaceId) {
          return new Response(
            JSON.stringify({ error: 'bad_request', message: 'Missing required parameter: cwd' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const params: Record<string, string> = { cwd, workspaceId };
        if (shell) params.shell = shell;
        if (sessionId) params.sessionId = sessionId;
        const upgraded = server.upgrade(req, {
          data: { path: '/ws/terminal', params } as unknown as undefined,
        });
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
        return undefined;
      }

      if (url.pathname === '/ws') {
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

        const upgraded = server.upgrade(req, {
          data: { path: '/ws' } as unknown as undefined,
        });
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
        return undefined;
      }

      return app.fetch(req);
    },

    websocket: {
      idleTimeout: parseInt(process.env.JEAN2_WS_IDLE_TIMEOUT || '255', 10),
      open(ws) {
        const wsData = ws.data as WsData | undefined;
        if (wsData?.path === '/ws/terminal/events') {
          const workspaceId = wsData.params?.workspaceId || '';
          const sessions = getTerminalManager().listSessionsByWorkspaceId(workspaceId);
          getTerminalEventManager().subscribe(workspaceId, ws as unknown as ServerWebSocket);
          ws.send(JSON.stringify({ type: 'snapshot', sessions }));
          return;
        }
        if (wsData?.path === '/ws/terminal') {
          const sessionId = wsData.params?.sessionId;
          if (sessionId) {
            const reconnected = getTerminalManager().reconnectSession(ws as unknown as ServerWebSocket, sessionId);
            if (!reconnected) {
              const errorPayload = new TextEncoder().encode(JSON.stringify({ message: 'Session not found' }));
              ws.send(encodeFrame(OPCODES.ERROR, errorPayload));
              ws.close();
              return;
            }
            const session = getTerminalManager().getSession(sessionId);
            if (session) {
              const initPayload = new TextEncoder().encode(JSON.stringify({
                sessionId: session.id,
                pid: session.pid,
                shell: session.shell,
                cwd: session.cwd,
                cols: session.cols,
                rows: session.rows,
                createdAt: session.createdAt,
                status: session.status,
                exitCode: session.exitCode,
                isReconnect: true,
                title: session.title,
                inAlternateScreen: session.inAlternateScreen,
              }));
              ws.send(encodeFrame(OPCODES.INIT_ACK, initPayload));
            }
          } else {
            const createdId = getTerminalManager().createSession(ws as unknown as ServerWebSocket, {
              shell: wsData.params?.shell,
              cwd: wsData.params?.cwd || '',
              workspaceId: wsData.params?.workspaceId || '',
              cols: 80,
              rows: 24,
            });
            if (createdId) {
              const session = getTerminalManager().getSession(createdId);
              if (session) {
                const initPayload = new TextEncoder().encode(JSON.stringify({
                  sessionId: session.id,
                  pid: session.pid,
                  shell: session.shell,
                  cwd: session.cwd,
                  cols: session.cols,
                  rows: session.rows,
                  createdAt: session.createdAt,
                  status: session.status,
                  exitCode: session.exitCode,
                  isReconnect: false,
                  title: session.title,
                  inAlternateScreen: session.inAlternateScreen,
                }));
                ws.send(encodeFrame(OPCODES.INIT_ACK, initPayload));
              }
            }
          }
          return;
        }
        clients.set(ws, { missedPings: 0 });
      },

      close(ws) {
        const wsData = ws.data as WsData | undefined;
        if (wsData?.path === '/ws/terminal/events') {
          const workspaceId = wsData.params?.workspaceId || '';
          getTerminalEventManager().unsubscribe(workspaceId, ws as unknown as ServerWebSocket);
          return;
        }
        if (wsData?.path === '/ws/terminal') {
          getTerminalManager().removeClient(ws as unknown as ServerWebSocket);
          return;
        }
        clients.delete(ws);
      },

      async message(ws, message) {
        const wsData = ws.data as WsData | undefined;
        if (wsData?.path === '/ws/terminal') {
          if (message !== undefined) {
            handleTerminalMessage(ws as unknown as ServerWebSocket, message as string | Buffer | undefined);
          }
          return;
        }
        try {
          const msg: ClientMessage = JSON.parse((message ?? '').toString());
          await handleClientMessage(ws, msg);
        } catch (err) {
          console.error('WebSocket message error:', err);
          ws.send(JSON.stringify({ type: 'error', code: 'parse_error', message: String(err) }));
        }
      },
    },
  });

  const HEARTBEAT_INTERVAL_MS = 30_000;
  const MAX_MISSED_PINGS = 3;

  const heartbeatInterval = setInterval(() => {
    for (const [ws, data] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        data.missedPings++;
        if (data.missedPings > MAX_MISSED_PINGS) {
          ws.close(1000, 'Heartbeat timeout');
          clients.delete(ws);
        } else {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`AI Agent Server running at ${protocol}://${host}:${port}`);

  const onShutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    clearInterval(heartbeatInterval);
    cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', () => onShutdown('SIGTERM'));
  process.on('SIGINT', () => onShutdown('SIGINT'));

  const cleanup = () => {
    clearInterval(heartbeatInterval);
    server.stop();
    getTerminalManager().destroyAllSessions();
    closeDatabase();
    process.removeListener('SIGTERM', onShutdown);
    process.removeListener('SIGINT', onShutdown);
  };

  return { server, cleanup };
}

function send(ws: ServerWebSocket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

function handleTerminalMessage(ws: ServerWebSocket, message: string | Buffer | undefined): void {
  try {
    if (!message) return;
    const data = message instanceof Buffer
      ? new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
      : new TextEncoder().encode(message as string);
    if (data.length < 1) return;

    const opcode = data[0];
    const payload = data.slice(1);

    switch (opcode) {
      case 0x01: {
        const input = new TextDecoder().decode(payload);
        getTerminalManager().handleInput(ws, input);
        break;
      }
      case 0x02: {
        const { cols, rows } = JSON.parse(new TextDecoder().decode(payload)) as { cols: number; rows: number };
        getTerminalManager().handleResize(ws, cols, rows);
        break;
      }
      case 0x03: {
        getTerminalManager().destroySession(ws);
        ws.close();
        break;
      }
    }
  } catch (err) {
    console.error('Terminal message error:', err);
  }
}

async function handleClientMessage(ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'session.create': {
      const sessionId = crypto.randomUUID();
      const session = createSession({
        id: sessionId,
        workspaceId: msg.workspaceId || '',
        preconfigId: msg.preconfigId || null,
        title: msg.title || 'New Session',
        status: 'active',
        metadata: null,
        parentId: null,
        agentName: null,
      });
      clients.set(ws, { sessionId: session.id, missedPings: 0 });

      if (msg.preconfigId) {
        const preconfig = await getPreconfig(msg.preconfigId);
        if (preconfig) {
          const updates: { selectedModel?: string; selectedProvider?: string; selectedVariant?: string | null } = {};
          if (preconfig.model) updates.selectedModel = preconfig.model;
          if (preconfig.provider) updates.selectedProvider = preconfig.provider;
          updates.selectedVariant = preconfig.variant ?? null;
          const updated = updateSession(sessionId, updates);
          send(ws, { type: 'session.created', session: updated! });
          broadcastSessionCreatedExclude(updated!, ws);
          break;
        }
      }

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
      clients.set(ws, { sessionId: session.id, missedPings: 0 });

      const isRunning = interruptManager.isSessionActive(session.id);

      reconcileSessionCompaction(session.id);
      if (!isRunning) {
        reconcileOrphanedToolCalls(session.id);
      }

      const reconciledSession = getSession(msg.sessionId);

      const messages = listMessagesWithParts(session.id);

      send(ws, {
        type: 'session.resumed',
        session: reconciledSession!,
        messages,
        usage: reconciledSession!.totalTokens ? {
          promptTokens: reconciledSession!.promptTokens ?? 0,
          completionTokens: reconciledSession!.completionTokens ?? 0,
          totalTokens: reconciledSession!.totalTokens ?? 0,
        } : undefined,
        isRunning,
      });

      const queuedMessages = listQueuedMessages(msg.sessionId);
      if (queuedMessages.length > 0) {
        send(ws, {
          type: 'queue.list',
          sessionId: msg.sessionId,
          messages: queuedMessages,
        });
      }

      // Re-send pending asks for this session and any child sessions
      const now = Date.now();
      const pendingAsks = listPendingAsksByRootSession(msg.sessionId);
      // Filter out asks that have expired (their timers may have fired while client was disconnected)
      const activePendingAsks = pendingAsks.filter(ask => (now - ask.createdAt) < ASK_TIMEOUT);
      for (const ask of activePendingAsks) {
        // Rewrite child session asks to route to the root session
        const isChildAsk = ask.sessionId !== msg.sessionId;
        const askPayload = isChildAsk
          ? { ...ask.ask, _originSessionId: ask.sessionId }
          : ask.ask;
        send(ws, {
          type: 'ask.request',
          sessionId: msg.sessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: askPayload as unknown as Ask,
        });
      }

      // Also send pending asks from all other sessions
      const allPendingAsks = listAllPendingAsks();
      const otherPendingAsks = allPendingAsks.filter(
        (ask) =>
          ask.sessionId !== msg.sessionId &&
          !activePendingAsks.some((pa) => pa.toolCallId === ask.toolCallId) &&
          (now - ask.createdAt) < ASK_TIMEOUT,
      );
      for (const ask of otherPendingAsks) {
        send(ws, {
          type: 'ask.request',
          sessionId: ask.sessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: ask.ask,
        });
      }

      // Clean up any expired asks from DB
      cleanupAllPendingAsks(ASK_TIMEOUT);

      break;
    }

    case 'session.update': {
      const session = getSession(msg.sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updates: { preconfigId?: string; selectedVariant?: string | null } = {};
      if (msg.preconfigId !== undefined) {
        updates.preconfigId = msg.preconfigId;
        const preconfig = await getPreconfig(msg.preconfigId);
        if (preconfig?.variant) {
          updates.selectedVariant = preconfig.variant;
        } else {
          updates.selectedVariant = null;
        }
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
        selectedProvider: msg.providerId,
        selectedVariant: msg.variant || null,
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
      await handleChat(ws, msg.sessionId, msg.content, msg.attachments);
      break;
    }

    case 'permission.list': {
      const grants = getWorkspaceGrants(msg.workspaceId, { includeRevoked: msg.includeRevoked });
      send(ws, { type: 'permission.list', workspaceId: msg.workspaceId, grants });
      break;
    }

    case 'permission.revoke': {
      revokeGrant(msg.grantId, null);
      send(ws, { type: 'permission.revoked', grantId: msg.grantId });
      break;
    }

    case 'permission.revoke_all': {
      const count = revokeAllWorkspaceGrants(msg.workspaceId, null);
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

      const queuedMessage = addMessageToQueue(msg.sessionId, msg.content, msg.attachments);
      clients.set(ws, { sessionId: msg.sessionId, missedPings: 0 });

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

    case 'provider.connect': {
      try {
        const result = await providerManager.connectProvider(msg.provider);
        const status = await providerManager.getProviderStatus(msg.provider);
        broadcast({
          type: 'provider.status',
          provider: msg.provider,
          connected: status.connected,
          authorizationUrl: result.authorizationUrl,
        });

        const provider = providerManager.getProvider(msg.provider);
        if (provider?.onConnectComplete) {
          provider.onConnectComplete((success, error) => {
            if (success) {
              const newStatus = providerManager.getProviderStatus(msg.provider);
              broadcast({
                type: 'provider.connected',
                provider: msg.provider,
                connected: true,
                connectedAt: newStatus.connectedAt,
                accountId: newStatus.accountId,
              });
            } else {
              broadcast({
                type: 'provider.status',
                provider: msg.provider,
                connected: false,
                error: error || 'Connection flow failed',
              });
            }
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect provider';
        broadcast({
          type: 'provider.status',
          provider: msg.provider,
          connected: false,
          error: message,
        });
      }
      break;
    }

    case 'provider.disconnect': {
      try {
        await providerManager.disconnectProvider(msg.provider);
        broadcast({
          type: 'provider.connected',
          provider: msg.provider,
          connected: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to disconnect provider';
        send(ws, { type: 'error', code: 'provider_error', message });
      }
      break;
    }

    case 'pong': {
      const clientData = clients.get(ws);
      if (clientData) {
        clientData.missedPings = 0;
      }
      break;
    }

    case 'ask.response': {
      const { toolCallId, response } = msg as AskResponseMessage;
      resolveAsk(toolCallId, response);
      break;
    }

    default:
      send(ws, { type: 'error', code: 'unknown_message', message: 'Unknown message type' });
  }
}

async function handleSessionCompact(
  ws: ServerWebSocket,
  msg: { sessionId: string; messageIds?: string[] }
) {
  const session = getSession(msg.sessionId);
  if (!session) {
    send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }

  const execResult = await executeCompaction(msg.sessionId, 'manual');

  if (execResult.ok) {
    send(ws, {
      type: 'compaction.complete',
      sessionId: msg.sessionId,
      tokensUsed: execResult.result.tokensUsed,
    });
  } else {
    if (execResult.skipped) {
      send(ws, { type: 'error', code: 'invalid_session', message: execResult.error });
    } else {
      send(ws, { type: 'error', code: 'compaction_error', message: execResult.error });
    }
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

function findReplayText(sessionId: string): string | null {
  const allMessages = listMessagesWithParts(sessionId);

  for (let i = allMessages.length - 2; i >= 0; i--) {
    const m = allMessages[i];
    if (m.message.role !== 'user') continue;
    if (m.parts.every((p) => p.type === 'compaction')) continue;

    const texts: string[] = [];
    for (const p of m.parts) {
      if (p.type === 'text' && p.text !== undefined) {
        if (!p.text.startsWith('Continue:') && !p.text.startsWith('Continue from')) {
          texts.push(p.text);
        }
      }
    }
    const text = texts.join(' ').trim();
    if (text) {
      return `Replay: ${text}`;
    }
  }

  return null;
}

async function drainQueue(
  ws: ServerWebSocket,
  sessionId: string,
): Promise<{ content: string; attachments?: Array<{ id: string; kind: string }> } | null> {
  const nextMsg = getNextQueuedMessage(sessionId);

  if (!nextMsg) {
    return null;
  }

  broadcast({
    type: 'queue.sending',
    sessionId,
    queueId: nextMsg.id,
  });

  deleteQueuedMessage(nextMsg.id);

  return {
    content: nextMsg.content,
    ...(nextMsg.attachments ? { attachments: nextMsg.attachments } : {}),
  };
}

interface ChatTurnResult {
  streamCompleted: boolean;
  needsAutoCompaction: boolean;
  contextOverflow: boolean;
  isFatal: boolean;
  isQueueDrainable: boolean;
  errorMessage?: string;
  errorCode?: string;
  errorType?: 'rate_limit' | 'server' | 'timeout' | 'auth' | 'context_overflow' | 'invalid_request';
  retryAfterMs?: number;
}

async function runSingleChatTurn(
  ws: ServerWebSocket,
  sessionId: string,
  content: string,
  preconfig: NonNullable<Awaited<ReturnType<typeof getPreconfig>>>,
  modelId: string,
  provider: string,
  workspacePath: string | null | undefined,
  session: NonNullable<ReturnType<typeof getSession>>,
  attachments?: Array<{ id: string; kind: string }>,
): Promise<ChatTurnResult> {
  const userMsgId = crypto.randomUUID();

  const userMessage = {
    id: userMsgId,
    sessionId,
    role: 'user' as const,
    createdAt: Date.now(),
  };
  createMessage(userMessage);

  const textPartId = crypto.randomUUID();
  const textPart = {
    id: textPartId,
    messageId: userMsgId,
    createdAt: Date.now(),
    type: 'text' as const,
    text: content,
  };
  createPart(textPart, sessionId);

  broadcast({ type: 'message.created', message: userMessage });
  broadcast({ type: 'part.created', sessionId, part: textPart });

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      const attachmentRecord = getAttachment(sessionId, attachment.id);
      if (!attachmentRecord) continue;

      const partId = crypto.randomUUID();
      const serverUrl = `/api/sessions/${sessionId}/attachments/${attachmentRecord.id}/content?key=${attachmentRecord.accessKey}`;

      if (attachmentRecord.kind === 'image') {
        const imagePart = {
          id: partId,
          messageId: userMsgId,
          createdAt: Date.now(),
          type: 'image' as const,
          url: serverUrl,
          mimeType: attachmentRecord.mimeType,
        };
        createPart(imagePart, sessionId);
        broadcast({ type: 'part.created', sessionId, part: imagePart });
      } else {
        const filePart = {
          id: partId,
          messageId: userMsgId,
          createdAt: Date.now(),
          type: 'file' as const,
          url: serverUrl,
          mimeType: attachmentRecord.mimeType,
          filename: attachmentRecord.filename,
        };
        createPart(filePart, sessionId);
        broadcast({ type: 'part.created', sessionId, part: filePart });
      }
    }
  }

  const { messages: history } = buildEffectiveContextHistory(sessionId);

  const askBroadcastFn: AskBroadcastFn = (message) => {
    broadcast(message as ServerMessage);
  };

  let pendingCompaction = false;

  try {
    for await (const event of streamChatWithRetry({
      sessionId,
      preconfig,
      messages: history,
      modelId: modelId,
      providerId: provider,
      variant: session.selectedVariant || undefined,
      workspacePath: workspacePath ?? undefined,
      workspaceId: session.workspaceId || undefined,
      broadcastFn: askBroadcastFn,
    })) {
      switch (event.type) {
        case 'message.created':
          broadcast(event);
          break;

        case 'message.updated':
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
            variant: event.variant ?? undefined,
          });
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

        case 'needs_compaction':
          pendingCompaction = true;
          break;

        case 'error.rate_limit':
          send(ws, {
            type: 'error.rate_limit',
            code: 'rate_limit',
            message: event.message,
            retryAfterMs: event.retryAfterMs,
          });
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: false,
            isFatal: true,
            isQueueDrainable: false,
            errorMessage: event.message,
            errorType: 'rate_limit',
            retryAfterMs: event.retryAfterMs,
          };

        case 'error.server':
          send(ws, {
            type: 'error.server',
            code: 'server_error',
            message: event.message,
            retryAfterMs: event.retryAfterMs,
          });
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: false,
            isFatal: false,
            isQueueDrainable: true,
            errorMessage: event.message,
            errorType: 'server',
            retryAfterMs: event.retryAfterMs,
          };

        case 'error.timeout':
          send(ws, {
            type: 'error.timeout',
            code: 'timeout',
            message: event.message,
            retryAfterMs: event.retryAfterMs,
          });
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: false,
            isFatal: false,
            isQueueDrainable: true,
            errorMessage: event.message,
            errorType: 'timeout',
            retryAfterMs: event.retryAfterMs,
          };

        case 'error.auth':
          send(ws, {
            type: 'error',
            code: 'authentication',
            message: event.message,
          });
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: false,
            isFatal: true,
            isQueueDrainable: false,
            errorMessage: event.message,
            errorType: 'auth',
          };

        case 'error.context_overflow': {
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: true,
            isFatal: false,
            isQueueDrainable: false,
            errorMessage: event.message,
            errorType: 'context_overflow',
          };
        }

        case 'error.invalid_request':
          send(ws, {
            type: 'error',
            code: 'invalid_request',
            message: event.message,
          });
          return {
            streamCompleted: false,
            needsAutoCompaction: false,
            contextOverflow: false,
            isFatal: true,
            isQueueDrainable: false,
            errorMessage: event.message,
            errorType: 'invalid_request',
          };
      }
    }

    return {
      streamCompleted: true,
      needsAutoCompaction: pendingCompaction,
      contextOverflow: false,
      isFatal: false,
      isQueueDrainable: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    console.error('Unexpected chat error:', err);
    send(ws, { type: 'error', code: 'chat_error', message });
    return {
      streamCompleted: false,
      needsAutoCompaction: false,
      contextOverflow: false,
      isFatal: true,
      isQueueDrainable: false,
      errorMessage: message,
      errorType: 'server',
    };
  }
}

async function handleChat(
  ws: ServerWebSocket,
  sessionId: string,
  content: string,
  attachments?: Array<{ id: string; kind: string }>,
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }

  if (session.status === 'closed') {
    send(ws, { type: 'error', code: 'session_closed', message: 'Cannot send messages to an archived session. Reopen it first.' });
    return;
  }

  // If session is already actively streaming (e.g., subagent running), queue the message instead
  if (interruptManager.isSessionActive(sessionId)) {
    const queuedMessage = addMessageToQueue(sessionId, content, attachments);
    clients.set(ws, { sessionId, missedPings: 0 });
    send(ws, { type: 'queue.added', sessionId, message: queuedMessage });
    return;
  }

  const workspace = session.workspaceId ? getWorkspace(session.workspaceId) : null;
  const workspacePath = workspace?.path;

  const preconfig = session.preconfigId
    ? await getPreconfig(session.preconfigId)
    : await getDefaultPreconfig();

  if (!preconfig) {
    send(ws, { type: 'error', code: 'no_preconfig', message: 'No preconfig found' });
    return;
  }

  const config = getModelsConfig();
  const configDefaultModel = config.defaultModel;

  const modelId = session.selectedModel || preconfig?.model || configDefaultModel;
  const provider = session.selectedProvider ||
                  (preconfig?.model ? findProviderFromModel(preconfig.model) : null) ||
                  config.defaultProvider;

  function findProviderFromModel(m: string): string {
    const modelInfo = findModel(m);
    if (modelInfo) return modelInfo.providerId;
    if (m.includes('/')) return 'openrouter';
    if (m.startsWith('claude-')) return 'anthropic';
    if (m.startsWith('gemini-')) return 'google';
    return 'openai';
  }

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

  const isConnectableProvider = providerManager.getProvider(provider) !== null;
  if (!apiKey && !isConnectableProvider) {
    const envKey = `JEAN2_LLM_${provider.toUpperCase()}_API_KEY`;
    send(ws, { type: 'error', code: 'no_api_key', message: `No API key configured for provider: ${provider}. Set ${envKey}` });
    return;
  }

  let currentContent: string = content;
  let currentAttachments: Array<{ id: string; kind: string }> | undefined = attachments;
  let overflowRetryDepth = 0;

  while (true) {
    const result = await runSingleChatTurn(
      ws,
      sessionId,
      currentContent,
      preconfig,
      modelId,
      provider,
      workspacePath,
      session,
      currentAttachments,
    );

    if (result.contextOverflow) {
      if (overflowRetryDepth >= 1) {
        send(ws, { type: 'error', code: 'context_overflow', message: result.errorMessage ?? 'Context overflow' });
        return;
      }

      const currentSession = getSession(sessionId);
      const isMainSession = currentSession && !currentSession.parentId;

      if (isMainSession && !shouldSkipCompaction(sessionId)) {
        const replayText = findReplayText(sessionId);
        const execResult = await executeCompaction(sessionId, 'overflow');

        if (execResult.ok) {
          clearCompactionFailure(sessionId);
          overflowRetryDepth++;
          currentContent = replayText ?? 'Continue from where we left off, using the compacted context.';
          continue;
        } else if (!execResult.skipped) {
          recordCompactionFailure(sessionId);
          console.warn(`[handleChat] Overflow compaction failed for session ${sessionId}: ${execResult.error}`);
        }
      }

      send(ws, { type: 'error', code: 'context_overflow', message: result.errorMessage ?? 'Context overflow' });
      return;
    }

    if (result.isFatal) {
      return;
    }

    if (result.isQueueDrainable) {
      const next = await drainQueue(ws, sessionId);
      if (next) {
        currentContent = next.content;
        currentAttachments = next.attachments;
        continue;
      }
    }

    if (result.streamCompleted && result.needsAutoCompaction) {
      const currentSession = getSession(sessionId);
      if (currentSession && !currentSession.parentId && !shouldSkipCompaction(sessionId)) {
        const execResult = await executeCompaction(sessionId, 'auto');
        if (execResult.ok) {
          clearCompactionFailure(sessionId);
        } else if (!execResult.skipped) {
          recordCompactionFailure(sessionId);
          console.warn(`[handleChat] Auto-compaction failed for session ${sessionId}: ${execResult.error}`);
        }
      }
      const next = await drainQueue(ws, sessionId);
      if (next) {
        currentContent = next.content;
        currentAttachments = next.attachments;
        continue;
      }
      return;
    }

    if (result.streamCompleted) {
      const next = await drainQueue(ws, sessionId);
      if (next) {
        currentContent = next.content;
        currentAttachments = next.attachments;
        continue;
      }
      return;
    }

    return;
  }
}

if (import.meta.main) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { startServer };
