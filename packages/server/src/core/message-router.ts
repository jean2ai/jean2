import type { ServerMessage, ClientMessage, AskResponseMessage, Ask } from '@jean2/sdk';
import { resolveAsk, ASK_TIMEOUT, type AskBroadcastFn } from '@/tools/ask-user-api';
import { listAllPendingAsks, cleanupAllPendingAsks, listPendingRequestsByRootSession } from '@/store/pending-asks';
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
  reconcileOrphanedToolCalls,
  getAttachment,
} from '@/store';
import { getWorkspace } from '@/store/workspaces';
import { getWorkspaceGrants, revokeGrant, revokeAllWorkspaceGrants } from '@/store/permissions';
import { streamChatWithRetry } from '@/core/retry';
import { getModelsConfig, findModel } from '@/config';
import { getPreconfig, getDefaultPreconfig } from '@/core/preconfig';
import { executeCompaction } from '@/core/compaction-executor';
import { revertToStep } from '@/core/revert';
import { forkSession } from '@/core/fork';
import { interruptManager } from '@/core/interrupt';
import { broadcastSessionCreatedExclude } from '@/core/broadcast';
import {
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
} from '@/env';
import * as providerManager from '@/providers';
import { isSandboxActive, sandboxController } from '@/sandbox';
import type { SandboxRespondMessage } from '@/sandbox';
import type { ServerWebSocket } from 'bun';

// ── Context ────────────────────────────────────────────────────

export interface ClientEntry {
  sessionId?: string;
  missedPings: number;
}

export interface RouterContext {
  /** Send a message to a single WebSocket client */
  send: (ws: ServerWebSocket, msg: ServerMessage) => void;
  /** Broadcast a message to all connected clients (optionally excluding one) */
  broadcast: (message: ServerMessage, excludeWs?: ServerWebSocket) => void;
  /** Map of connected WS clients for session tracking and heartbeat */
  clients: Map<ServerWebSocket, ClientEntry>;
}

// ── Compaction failure tracking ────────────────────────────────

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

// ── Chat helpers ───────────────────────────────────────────────

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
  ctx: RouterContext,
  sessionId: string,
): Promise<{ content: string; attachments?: Array<{ id: string; kind: string }> } | null> {
  const nextMsg = getNextQueuedMessage(sessionId);

  if (!nextMsg) {
    return null;
  }

  ctx.broadcast({
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

// ── Chat turn ──────────────────────────────────────────────────

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
  ctx: RouterContext,
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

  ctx.broadcast({ type: 'message.created', message: userMessage });
  ctx.broadcast({ type: 'part.created', sessionId, part: textPart });

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
        ctx.broadcast({ type: 'part.created', sessionId, part: imagePart });
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
        ctx.broadcast({ type: 'part.created', sessionId, part: filePart });
      }
    }
  }

  const { messages: history } = buildEffectiveContextHistory(sessionId);

  const askBroadcastFn: AskBroadcastFn = (message) => {
    ctx.broadcast(message as ServerMessage);
  };

  let pendingCompaction = false;
  const effectiveProvider = isSandboxActive() ? 'sandbox' : provider;

  try {
    for await (const event of streamChatWithRetry({
      sessionId,
      preconfig,
      messages: history,
      modelId: modelId,
      providerId: effectiveProvider,
      variant: session.selectedVariant || undefined,
      workspacePath: workspacePath ?? undefined,
      workspaceId: session.workspaceId || undefined,
      broadcastFn: askBroadcastFn,
    })) {
      switch (event.type) {
        case 'message.created':
          ctx.broadcast(event);
          break;

        case 'message.updated':
          updateMessage(event.message.id, event.message);
          ctx.broadcast(event);
          break;

        case 'part.created':
          ctx.broadcast(event);
          break;

        case 'part.updated':
          ctx.broadcast(event);
          break;

        case 'part.append':
          ctx.broadcast(event);
          break;

        case 'usage': {
          ctx.broadcast({
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
          ctx.send(ws, {
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
          ctx.send(ws, {
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
          ctx.send(ws, {
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
          ctx.send(ws, {
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
          ctx.send(ws, {
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
    ctx.send(ws, { type: 'error', code: 'chat_error', message });
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

// ── Chat handler ───────────────────────────────────────────────

async function handleChat(
  ctx: RouterContext,
  ws: ServerWebSocket,
  sessionId: string,
  content: string,
  attachments?: Array<{ id: string; kind: string }>,
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }

  if (session.status === 'closed') {
    ctx.send(ws, { type: 'error', code: 'session_closed', message: 'Cannot send messages to an archived session. Reopen it first.' });
    return;
  }

  // If session is already actively streaming (e.g., subagent running), queue the message instead
  if (interruptManager.isSessionActive(sessionId)) {
    const queuedMessage = addMessageToQueue(sessionId, content, attachments);
    ctx.clients.set(ws, { sessionId, missedPings: 0 });
    ctx.send(ws, { type: 'queue.added', sessionId, message: queuedMessage });
    return;
  }

  const workspace = session.workspaceId ? getWorkspace(session.workspaceId) : null;
  const workspacePath = workspace?.path;

  const preconfig = session.preconfigId
    ? await getPreconfig(session.preconfigId)
    : await getDefaultPreconfig();

  if (!preconfig) {
    ctx.send(ws, { type: 'error', code: 'no_preconfig', message: 'No preconfig found' });
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
    ctx.send(ws, { type: 'error', code: 'no_api_key', message: `No API key configured for provider: ${provider}. Set ${envKey}` });
    return;
  }

  let currentContent: string = content;
  let currentAttachments: Array<{ id: string; kind: string }> | undefined = attachments;
  let overflowRetryDepth = 0;

  while (true) {
    const result = await runSingleChatTurn(
      ctx,
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
        ctx.send(ws, { type: 'error', code: 'context_overflow', message: result.errorMessage ?? 'Context overflow' });
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

      ctx.send(ws, { type: 'error', code: 'context_overflow', message: result.errorMessage ?? 'Context overflow' });
      return;
    }

    if (result.isFatal) {
      return;
    }

    if (result.isQueueDrainable) {
      const next = await drainQueue(ctx, sessionId);
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
      const next = await drainQueue(ctx, sessionId);
      if (next) {
        currentContent = next.content;
        currentAttachments = next.attachments;
        continue;
      }
      return;
    }

    if (result.streamCompleted) {
      const next = await drainQueue(ctx, sessionId);
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

// ── Sub-handlers ───────────────────────────────────────────────

async function handleSessionCompact(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageIds?: string[] },
) {
  const session = getSession(msg.sessionId);
  if (!session) {
    ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }

  const execResult = await executeCompaction(msg.sessionId, 'manual');

  if (execResult.ok) {
    ctx.send(ws, {
      type: 'compaction.complete',
      sessionId: msg.sessionId,
      tokensUsed: execResult.result.tokensUsed,
    });
  } else {
    if (execResult.skipped) {
      ctx.send(ws, { type: 'error', code: 'invalid_session', message: execResult.error });
    } else {
      ctx.send(ws, { type: 'error', code: 'compaction_error', message: execResult.error });
    }
  }
}

async function handleSessionRevert(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string },
) {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
      return;
    }

    const result = await revertToStep({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
    });

    ctx.broadcast({
      type: 'session.reverted',
      sessionId: msg.sessionId,
      revertedTo: result.revertedTo,
      removed: result.removed,
    });

    const currentState = listMessagesWithParts(msg.sessionId);
    ctx.broadcast({
      type: 'session.state',
      sessionId: msg.sessionId,
      messages: currentState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Revert failed';
    ctx.send(ws, { type: 'error', code: 'revert_error', message });
  }
}

async function handleSessionFork(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string; title?: string },
) {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
      return;
    }

    const result = await forkSession({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
      title: msg.title,
    });

    ctx.broadcast({
      type: 'session.forked',
      originalSessionId: msg.sessionId,
      forkedSession: result.forkedSession,
      messages: result.messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fork failed';
    ctx.send(ws, { type: 'error', code: 'fork_error', message });
  }
}

// ── Main message dispatcher ────────────────────────────────────

export async function handleClientMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: ClientMessage,
): Promise<void> {
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
      ctx.clients.set(ws, { sessionId: session.id, missedPings: 0 });

      if (msg.preconfigId) {
        const preconfig = await getPreconfig(msg.preconfigId);
        if (preconfig) {
          const updates: { selectedModel?: string; selectedProvider?: string; selectedVariant?: string | null } = {};
          if (preconfig.model) updates.selectedModel = preconfig.model;
          if (preconfig.provider) updates.selectedProvider = preconfig.provider;
          updates.selectedVariant = preconfig.variant ?? null;
          const updated = updateSession(sessionId, updates);
          ctx.send(ws, { type: 'session.created', session: updated! });
          broadcastSessionCreatedExclude(updated!, ws);
          break;
        }
      }

      ctx.send(ws, { type: 'session.created', session });
      broadcastSessionCreatedExclude(session, ws);
      break;
    }

    case 'session.resume': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      ctx.clients.set(ws, { sessionId: session.id, missedPings: 0 });

      const isRunning = interruptManager.isSessionActive(session.id);

      reconcileSessionCompaction(session.id);
      if (!isRunning) {
        reconcileOrphanedToolCalls(session.id);
      }

      const reconciledSession = getSession(msg.sessionId);

      const messages = listMessagesWithParts(session.id);

      ctx.send(ws, {
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
        ctx.send(ws, {
          type: 'queue.list',
          sessionId: msg.sessionId,
          messages: queuedMessages,
        });
      }

      // Clean up expired asks BEFORE replay so no stale entries are emitted
      cleanupAllPendingAsks(ASK_TIMEOUT);

      // Re-send pending asks for this session and any child sessions
      // Use DB-backed pending requests filtered by status='pending' only
      const activePendingAsks = listPendingRequestsByRootSession(msg.sessionId);
      for (const ask of activePendingAsks) {
        // Canonicalize: use rootSessionId as display session, matching live child-session.ts behavior.
        // When ask.rootSessionId is set and differs from ask.sessionId, the ask originated from a child
        // and must be presented under the root with _originSessionId — regardless of which session synced.
        const hasRootContext = ask.rootSessionId && ask.rootSessionId !== ask.sessionId;
        const canonicalSessionId = hasRootContext ? ask.rootSessionId! : ask.sessionId;
        const askPayload = hasRootContext
          ? { ...ask.ask, _originSessionId: ask.sessionId }
          : ask.ask;
        ctx.send(ws, {
          type: 'ask.request',
          sessionId: canonicalSessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: askPayload as unknown as Ask,
          requestId: ask.requestId,
        });
      }

      // Also send pending asks from all other sessions (status-based filtering)
      // Apply same canonical rewrite for child-origin asks as the live child-session path
      const otherPendingAsks = listAllPendingAsks().filter(
        (ask) =>
          ask.status === 'pending' &&
          ask.sessionId !== msg.sessionId &&
          !activePendingAsks.some((pa) => pa.requestId === ask.requestId),
      );
      for (const ask of otherPendingAsks) {
        // Canonicalize: if ask has a distinct root context, rewrite to root + _originSessionId
        // This matches live child-session behavior in child-session.ts
        const hasRootContext = ask.rootSessionId && ask.rootSessionId !== ask.sessionId;
        const effectiveSessionId = hasRootContext ? ask.rootSessionId! : ask.sessionId;
        const askPayload = hasRootContext
          ? { ...ask.ask, _originSessionId: ask.sessionId }
          : ask.ask;
        ctx.send(ws, {
          type: 'ask.request',
          sessionId: effectiveSessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: askPayload as unknown as Ask,
          requestId: ask.requestId,
        });
      }

      break;
    }

    case 'session.update': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
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
      ctx.send(ws, { type: 'session.updated', session: updated! });
      break;
    }

    case 'session.update_model': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const updated = updateSession(msg.sessionId, {
        selectedModel: msg.modelId,
        selectedProvider: msg.providerId,
        selectedVariant: msg.variant || null,
      });
      ctx.send(ws, { type: 'session.updated', session: updated! });
      break;
    }

    case 'session.close': {
      updateSession(msg.sessionId, { status: 'closed' });
      ctx.send(ws, { type: 'session.closed', sessionId: msg.sessionId });
      break;
    }

    case 'session.reopen': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const updated = updateSession(msg.sessionId, { status: 'active' });
      ctx.send(ws, { type: 'session.reopened', session: updated! });
      break;
    }

    case 'session.delete': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      deleteSession(msg.sessionId);
      ctx.send(ws, { type: 'session.deleted', sessionId: msg.sessionId });
      break;
    }

    case 'session.rename': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const trimmedTitle = msg.title?.trim() ?? '';
      if (!trimmedTitle) {
        ctx.send(ws, { type: 'error', code: 'invalid_title', message: 'Title cannot be empty' });
        break;
      }
      const updatedSession = updateSession(msg.sessionId, { title: trimmedTitle });
      ctx.broadcast({ type: 'session.renamed', session: updatedSession! });
      break;
    }

    case 'chat.message': {
      await handleChat(ctx, ws, msg.sessionId, msg.content, msg.attachments);
      break;
    }

    case 'permission.list': {
      const grants = getWorkspaceGrants(msg.workspaceId, { includeRevoked: msg.includeRevoked });
      ctx.send(ws, { type: 'permission.list', workspaceId: msg.workspaceId, grants });
      break;
    }

    case 'permission.revoke': {
      revokeGrant(msg.grantId, null);
      ctx.send(ws, { type: 'permission.revoked', grantId: msg.grantId });
      break;
    }

    case 'permission.revoke_all': {
      const count = revokeAllWorkspaceGrants(msg.workspaceId, null);
      ctx.send(ws, { type: 'permission.all_revoked', workspaceId: msg.workspaceId, count });
      break;
    }

    case 'session.compact': {
      await handleSessionCompact(ctx, ws, msg);
      break;
    }

    case 'session.revert': {
      await handleSessionRevert(ctx, ws, msg);
      break;
    }

    case 'session.fork': {
      await handleSessionFork(ctx, ws, msg);
      break;
    }

    case 'session.interrupt': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }

      try {
        const result = await interruptManager.interruptSession(
          msg.sessionId,
          msg.reason || 'user_request',
        );

        ctx.broadcast({
          type: 'session.interrupted',
          sessionId: msg.sessionId,
          result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Interrupt failed';
        ctx.send(ws, { type: 'error', code: 'interrupt_error', message });
      }
      break;
    }

    case 'queue.add': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }

      if (!msg.content || !msg.content.trim()) {
        ctx.send(ws, { type: 'error', code: 'invalid_content', message: 'Content cannot be empty' });
        return;
      }

      const queuedMessage = addMessageToQueue(msg.sessionId, msg.content, msg.attachments);
      ctx.clients.set(ws, { sessionId: msg.sessionId, missedPings: 0 });

      ctx.send(ws, {
        type: 'queue.added',
        sessionId: msg.sessionId,
        message: queuedMessage,
      });
      break;
    }

    case 'queue.remove': {
      const queuedMsg = getQueuedMessage(msg.queueId);
      if (!queuedMsg) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Queued message not found' });
        return;
      }

      deleteQueuedMessage(msg.queueId);

      ctx.send(ws, {
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
        ctx.broadcast({
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
              ctx.broadcast({
                type: 'provider.connected',
                provider: msg.provider,
                connected: true,
                connectedAt: newStatus.connectedAt,
                accountId: newStatus.accountId,
              });
            } else {
              ctx.broadcast({
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
        ctx.broadcast({
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
        ctx.broadcast({
          type: 'provider.connected',
          provider: msg.provider,
          connected: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to disconnect provider';
        ctx.send(ws, { type: 'error', code: 'provider_error', message });
      }
      break;
    }

    case 'pong': {
      const clientData = ctx.clients.get(ws);
      if (clientData) {
        clientData.missedPings = 0;
      }
      break;
    }

    case 'ask.response': {
      const { toolCallId, response, requestId } = msg as AskResponseMessage;
      resolveAsk(toolCallId, response, requestId);
      break;
    }

    case 'sandbox.respond': {
      try {
        const { callId, response } = msg as unknown as SandboxRespondMessage;
        sandboxController.respond(callId, response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sandbox response failed';
        ctx.send(ws, { type: 'error', code: 'sandbox_error', message });
      }
      break;
    }

    default:
      ctx.send(ws, { type: 'error', code: 'unknown_message', message: 'Unknown message type' });
  }
}
