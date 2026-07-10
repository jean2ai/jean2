import type { ClientMessage, ChatMessage, AskResponseMessage, Ask, ClientRegisterMessage, SessionControlClaimMessage, SessionControlReleaseMessage, SessionControlRequestTakeoverMessage, SessionControlRespondTakeoverMessage, AskAuthority } from '@jean2/sdk';
import { resolveAsk, ASK_TIMEOUT, getSessionIdForPendingAsk, getAuthorityForPendingAsk } from '@/tools/ask-user-api';
import { listAllPendingAsks, cleanupAllPendingAsks, listPendingRequestsByRootSession } from '@/store/pending-asks';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listMessagesWithParts,
  reconcileSessionCompaction,
  reconcileOrphanedToolCalls,
  addMessageToQueue,
  getQueuedMessage,
  listQueuedMessages,
  deleteQueuedMessage,
} from '@/store';
import { getWorkspaceAutoApproveSeverity } from '@/store/workspaces';
import { getWorkspaceGrants, revokeGrant, revokeAllWorkspaceGrants } from '@/store/permissions';
import { getPreconfigOrAgent } from '@/agents/storage';
import { interruptManager } from '@/core/interrupt';
import { broadcastSessionCreatedExclude } from '@/core/broadcast';
import { getAutoApproveTakeover } from '@/env';
import * as providerManager from '@/providers';
import { sandboxController } from '@/sandbox';
import type { SandboxRespondMessage } from '@/sandbox';
import type { ServerWebSocket } from 'bun';
import { handleClientRegistration, getClientIdForWs } from './client-registry';
import {
  handleSessionResume as handleControlSessionResume,
  handleClaim as handleControlClaim,
  handleRelease as handleControlRelease,
  handleRequestTakeover as handleControlRequestTakeover,
  handleRespondTakeover as handleControlRespondTakeover,
  buildControlUpdatedMessage,
  checkControllerGate,
  getControlState,
} from './session-control-registry';
import { checkAskResponseEligibility } from './capability-router';
import { markManualSessionTitle } from './session-title';

// Re-export for external consumers
export type { RouterContext, ClientEntry } from './router-context';

import type { RouterContext } from './router-context';
import { sendGateRejection } from './router-context';
import { handleChat, handleSessionEditMessage, regenerateSessionTitle } from './chat-handler';
import { handleSessionCompact, handleSessionRevert, handleSessionFork } from './session-handler';

// ── Main message dispatcher ────────────────────────────────────

export async function handleClientMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: ClientMessage,
): Promise<void> {
  switch (msg.type) {
    case 'client.register': {
      handleClientRegistration(ws, msg as ClientRegisterMessage, ctx.send);
      break;
    }

    case 'session.control.claim': {
      const claimMsg = msg as SessionControlClaimMessage;
      const result = handleControlClaim(claimMsg.sessionId, ws);
      if (result.success) {
        ctx.broadcastToSession(claimMsg.sessionId, buildControlUpdatedMessage(claimMsg.sessionId, result.transitionReason));
      } else {
        ctx.send(ws, {
          type: 'error',
          code: result.code,
          message: result.error,
        });
      }
      break;
    }

    case 'session.control.release': {
      const releaseMsg = msg as SessionControlReleaseMessage;
      const result = handleControlRelease(releaseMsg.sessionId, ws);
      if (result.success) {
        ctx.broadcastToSession(releaseMsg.sessionId, buildControlUpdatedMessage(releaseMsg.sessionId, result.transitionReason));
      } else {
        ctx.send(ws, {
          type: 'error',
          code: result.code,
          message: result.error,
        });
      }
      break;
    }

    case 'session.control.request_takeover': {
      const takeoverMsg = msg as SessionControlRequestTakeoverMessage;
      const result = handleControlRequestTakeover(takeoverMsg.sessionId, ws, getAutoApproveTakeover());
      if (result.success) {
        ctx.broadcastToSession(takeoverMsg.sessionId, buildControlUpdatedMessage(takeoverMsg.sessionId, result.transitionReason));
      } else {
        ctx.send(ws, {
          type: 'error',
          code: result.code,
          message: result.error,
        });
      }
      break;
    }

    case 'session.control.respond_takeover': {
      const respondMsg = msg as SessionControlRespondTakeoverMessage;
      const result = handleControlRespondTakeover(
        respondMsg.sessionId,
        ws,
        respondMsg.requesterClientId,
        respondMsg.decision,
      );
      if (result.success) {
        ctx.broadcastToSession(respondMsg.sessionId, buildControlUpdatedMessage(respondMsg.sessionId, result.transitionReason));
      } else {
        ctx.send(ws, {
          type: 'error',
          code: result.code,
          message: result.error,
        });
      }
      break;
    }

    case 'session.create': {
      const sessionId = crypto.randomUUID();
      const workspaceAutoApprove = getWorkspaceAutoApproveSeverity(msg.workspaceId || '');
      const session = createSession({
        id: sessionId,
        workspaceId: msg.workspaceId || '',
        preconfigId: msg.preconfigId || null,
        title: msg.title || 'New Session',
        status: 'active',
        metadata: null,
        parentId: null,
        agentName: null,
        autoApproveSeverity: workspaceAutoApprove,
      });
      ctx.clients.set(ws, { sessionId: session.id, missedPings: 0 });

      if (msg.preconfigId) {
        const preconfig = await getPreconfigOrAgent(msg.preconfigId);
        if (preconfig) {
          const updates: { selectedModel?: string; selectedProvider?: string; selectedVariant?: string | null; agentId?: string | null } = {};
          if (preconfig.model) updates.selectedModel = preconfig.model;
          if (preconfig.provider) updates.selectedProvider = preconfig.provider;
          updates.selectedVariant = preconfig.variant ?? null;
          const { isAgentSync } = await import('@/agents/storage');
          updates.agentId = isAgentSync(msg.preconfigId) ? msg.preconfigId : null;
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

      const controlResult = handleControlSessionResume(session.id, ws);

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
        control: controlResult.controlState,
      });

      if (controlResult.transitionReason) {
        ctx.broadcastToSession(session.id, buildControlUpdatedMessage(session.id, controlResult.transitionReason), ws);
      }

      const queuedMessages = listQueuedMessages(msg.sessionId);
      if (queuedMessages.length > 0) {
        ctx.send(ws, {
          type: 'queue.list',
          sessionId: msg.sessionId,
          messages: queuedMessages,
        });
      }

      cleanupAllPendingAsks(ASK_TIMEOUT);

      const activePendingAsks = listPendingRequestsByRootSession(msg.sessionId);
      const syncRequests: Array<{
        sessionId: string;
        toolCallId: string;
        toolName: string;
        ask: Ask;
        requestId?: string;
        _originSessionId?: string;
        authority?: AskAuthority;
      }> = [];

      for (const ask of activePendingAsks) {
        const hasRootContext = ask.rootSessionId && ask.rootSessionId !== ask.sessionId;
        const canonicalSessionId = hasRootContext ? ask.rootSessionId! : ask.sessionId;
        const askPayload = hasRootContext
          ? { ...ask.ask, _originSessionId: ask.sessionId }
          : ask.ask;
        const askAuthority = getAuthorityForPendingAsk(ask.toolCallId);
        syncRequests.push({
          sessionId: canonicalSessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: askPayload as unknown as Ask,
          requestId: ask.requestId,
          ...(hasRootContext ? { _originSessionId: ask.sessionId } : {}),
          authority: askAuthority ?? { visibilityScope: 'controller_only' as const, resolutionMode: 'controller_only' as const },
        });
      }

      const otherPendingAsks = listAllPendingAsks().filter(
        (ask) =>
          ask.status === 'pending' &&
          ask.sessionId !== msg.sessionId &&
          !activePendingAsks.some((pa) => pa.requestId === ask.requestId),
      );
      for (const ask of otherPendingAsks) {
        const hasRootContext = ask.rootSessionId && ask.rootSessionId !== ask.sessionId;
        const effectiveSessionId = hasRootContext ? ask.rootSessionId! : ask.sessionId;
        const askPayload = hasRootContext
          ? { ...ask.ask, _originSessionId: ask.sessionId }
          : ask.ask;
        const askAuthority = getAuthorityForPendingAsk(ask.toolCallId);
        syncRequests.push({
          sessionId: effectiveSessionId,
          toolCallId: ask.toolCallId,
          toolName: ask.toolName,
          ask: askPayload as unknown as Ask,
          requestId: ask.requestId,
          ...(hasRootContext ? { _originSessionId: ask.sessionId } : {}),
          authority: askAuthority ?? { visibilityScope: 'controller_only' as const, resolutionMode: 'controller_only' as const },
        });
      }

      ctx.send(ws, {
        type: 'ask.pending_sync',
        sessionId: msg.sessionId,
        requests: syncRequests,
      });

      break;
    }

    case 'session.update': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const gateUpdate = checkControllerGate(msg.sessionId, 'session.update', ws);
      if (gateUpdate) { sendGateRejection(ctx, ws, gateUpdate); break; }
      const updates: { preconfigId?: string; selectedVariant?: string | null; agentId?: string | null } = {};
      if (msg.preconfigId !== undefined) {
        updates.preconfigId = msg.preconfigId;
        const preconfig = await getPreconfigOrAgent(msg.preconfigId);
        if (preconfig?.variant) {
          updates.selectedVariant = preconfig.variant;
        } else {
          updates.selectedVariant = null;
        }
        const { isAgentSync } = await import('@/agents/storage');
        updates.agentId = isAgentSync(msg.preconfigId) ? msg.preconfigId : null;
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
      const gateModel = checkControllerGate(msg.sessionId, 'session.update_model', ws);
      if (gateModel) { sendGateRejection(ctx, ws, gateModel); break; }
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
      try {
        const session = getSession(msg.sessionId);
        if (!session) {
          ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
          break;
        }
        deleteSession(msg.sessionId);
        ctx.send(ws, { type: 'session.deleted', sessionId: msg.sessionId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Delete failed';
        ctx.send(ws, { type: 'error', code: 'delete_error', message, sessionId: msg.sessionId });
      }
      break;
    }

    case 'session.rename': {
      try {
        const session = getSession(msg.sessionId);
        if (!session) {
          ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
          break;
        }
        const trimmedTitle = msg.title?.trim() ?? '';
        if (!trimmedTitle) {
          ctx.send(ws, { type: 'error', code: 'invalid_title', message: 'Title cannot be empty', sessionId: msg.sessionId });
          break;
        }
        const updatedSession = updateSession(msg.sessionId, {
          title: trimmedTitle,
          metadata: markManualSessionTitle(session.metadata),
        });
        ctx.broadcastToSession(msg.sessionId, { type: 'session.renamed', session: updatedSession! });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Rename failed';
        ctx.send(ws, { type: 'error', code: 'rename_error', message, sessionId: msg.sessionId });
      }
      break;
    }

    case 'session.generate_title': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
        break;
      }
      void regenerateSessionTitle(ctx, ws, msg.sessionId, { force: true });
      break;
    }

    case 'chat.message': {
      const gateChat = checkControllerGate(msg.sessionId, 'chat.message', ws);
      if (gateChat) { sendGateRejection(ctx, ws, gateChat); break; }
      const chatMsg = msg as ChatMessage;
      await handleChat(ctx, ws, chatMsg.sessionId, chatMsg.content, chatMsg.attachments, chatMsg.responseFormatId, chatMsg.goalCondition, chatMsg.goalMaxTurns);
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

    case 'session.edit_message': {
      const gateEdit = checkControllerGate(msg.sessionId, 'chat.message', ws);
      if (gateEdit) { sendGateRejection(ctx, ws, gateEdit); break; }
      await handleSessionEditMessage(ctx, ws, msg);
      break;
    }

    case 'session.interrupt': {
      const session = getSession(msg.sessionId);
      if (!session) {
        ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
        break;
      }
      const gateInterrupt = checkControllerGate(msg.sessionId, 'session.interrupt', ws);
      if (gateInterrupt) { sendGateRejection(ctx, ws, gateInterrupt); break; }

      try {
        const result = await interruptManager.interruptSession(
          msg.sessionId,
          msg.reason || 'user_request',
        );

        ctx.broadcastToSession(msg.sessionId, {
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
      const gateQueueAdd = checkControllerGate(msg.sessionId, 'queue.add', ws);
      if (gateQueueAdd) { sendGateRejection(ctx, ws, gateQueueAdd); break; }

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
      const gateQueueRemove = checkControllerGate(queuedMsg.sessionId, 'queue.remove', ws);
      if (gateQueueRemove) { sendGateRejection(ctx, ws, gateQueueRemove); break; }

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
        const result = await providerManager.connectProvider(msg.provider, {
          redirectStrategy: msg.redirectStrategy as 'client_redirect' | 'manual_paste' | 'server_callback' | undefined,
        });
        const status = await providerManager.getProviderStatus(msg.provider);
        ctx.broadcast({
          type: 'provider.status',
          provider: msg.provider,
          connected: status.connected,
          authorizationUrl: result.authorizationUrl,
          flowId: result.flowId,
          redirectStrategy: result.redirectStrategy,
          redirectUri: result.redirectUri,
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
      const askSessionId = getSessionIdForPendingAsk(toolCallId, requestId);
      if (askSessionId) {
        const controlState = getControlState(askSessionId);
        const senderClientId = getClientIdForWs(ws);

        const askAuthority: AskAuthority =
          getAuthorityForPendingAsk(toolCallId) ?? {
            visibilityScope: 'controller_only',
            resolutionMode: 'controller_only',
          };

        if (!senderClientId && controlState.status !== 'uncontrolled') {
          ctx.send(ws, {
            type: 'ask.response_rejected',
            sessionId: askSessionId,
            toolCallId,
            requestId,
            code: 'not_allowed',
            message: 'Client must be registered to respond to asks',
          });
          break;
        }

        const eligibility = checkAskResponseEligibility(
          senderClientId ?? '',
          askSessionId,
          controlState.controllerClientId,
          askAuthority,
        );

        if (!eligibility.eligible) {
          ctx.send(ws, {
            type: 'ask.response_rejected',
            sessionId: askSessionId,
            toolCallId,
            requestId,
            code: senderClientId !== controlState.controllerClientId ? 'not_controller' : 'not_allowed',
            message: eligibility.reason ?? 'You are not eligible to respond to this ask',
          });
          break;
        }
      }
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
