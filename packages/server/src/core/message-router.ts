import type { ClientMessage } from '@jean2/sdk';
import type { ServerWebSocket } from 'bun';
import type { RouterContext } from './router-context';
import { sendGateRejection } from './router-context';
import { checkControllerGate } from './session-control-registry';
import { handleChat, handleSessionEditMessage } from './chat-handler';
import { handleSessionCompact, handleSessionRevert, handleSessionFork } from './session-handler';

import { handleClaimMessage, handleReleaseMessage, handleRequestTakeoverMessage, handleRespondTakeoverMessage } from './handlers/control';
import {
  handleCreateSession,
  handleResumeSession,
  handleUpdateSession,
  handleUpdateModelSession,
  handleCloseSession,
  handleReopenSession,
  handleDeleteSession,
  handleRenameSession,
  handleGenerateTitleSession,
  handleInterruptSession,
} from './handlers/session-lifecycle';
import { handleQueueAdd, handleQueueRemove } from './handlers/queue';
import { handlePermissionList, handlePermissionRevoke, handlePermissionRevokeAll } from './handlers/permissions';
import { handleProviderConnect, handleProviderDisconnect } from './handlers/providers';
import { handleClientRegister, handlePong, handleAskResponse, handleSandboxRespond } from './handlers/misc';

// Re-export for external consumers
export type { RouterContext, ClientEntry } from './router-context';

// ── Handler type ───────────────────────────────────────────────

type Handler = (ctx: RouterContext, ws: ServerWebSocket, msg: ClientMessage) => Promise<void> | void;

// ── Chat handler (inline gate check) ──────────────────────────

async function handleChatMessage(ctx: RouterContext, ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  const chatMsg = msg as Extract<ClientMessage, { type: 'chat.message' }>;
  const gate = checkControllerGate(chatMsg.sessionId, 'chat.message', ws);
  if (gate) { sendGateRejection(ctx, ws, gate); return; }
  await handleChat(ctx, ws, chatMsg.sessionId, chatMsg.content, chatMsg.attachments, chatMsg.responseFormatId, chatMsg.goalCondition, chatMsg.goalMaxTurns);
}

async function handleEditMessage(ctx: RouterContext, ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  const editMsg = msg as Extract<ClientMessage, { type: 'session.edit_message' }>;
  const gate = checkControllerGate(editMsg.sessionId, 'chat.message', ws);
  if (gate) { sendGateRejection(ctx, ws, gate); return; }
  await handleSessionEditMessage(ctx, ws, editMsg);
}

// ── Handler registry ──────────────────────────────────────────

// Cast a typed handler to the generic Handler type. The msg type is narrowed
// by the discriminator at dispatch time, but TS can't verify that statically.
function cast<M extends ClientMessage>(fn: (ctx: RouterContext, ws: ServerWebSocket, msg: M) => Promise<void> | void): Handler {
  return fn as Handler;
}

const handlers: Record<string, Handler> = {
  'client.register': cast(handleClientRegister),
  'session.control.claim': cast(handleClaimMessage),
  'session.control.release': cast(handleReleaseMessage),
  'session.control.request_takeover': cast(handleRequestTakeoverMessage),
  'session.control.respond_takeover': cast(handleRespondTakeoverMessage),
  'session.create': cast(handleCreateSession),
  'session.resume': cast(handleResumeSession),
  'session.update': cast(handleUpdateSession),
  'session.update_model': cast(handleUpdateModelSession),
  'session.close': cast(handleCloseSession),
  'session.reopen': cast(handleReopenSession),
  'session.delete': cast(handleDeleteSession),
  'session.rename': cast(handleRenameSession),
  'session.generate_title': cast(handleGenerateTitleSession),
  'chat.message': cast(handleChatMessage),
  'permission.list': cast(handlePermissionList),
  'permission.revoke': cast(handlePermissionRevoke),
  'permission.revoke_all': cast(handlePermissionRevokeAll),
  'session.compact': cast(handleSessionCompact),
  'session.revert': cast(handleSessionRevert),
  'session.fork': cast(handleSessionFork),
  'session.edit_message': cast(handleEditMessage),
  'session.interrupt': cast(handleInterruptSession),
  'queue.add': cast(handleQueueAdd),
  'queue.remove': cast(handleQueueRemove),
  'provider.connect': cast(handleProviderConnect),
  'provider.disconnect': cast(handleProviderDisconnect),
  'pong': cast(handlePong),
  'ask.response': cast(handleAskResponse),
  'sandbox.respond': cast(handleSandboxRespond),
};

// ── Dispatcher ─────────────────────────────────────────────────

export async function handleClientMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: ClientMessage,
): Promise<void> {
  const handler = handlers[msg.type];
  if (handler) {
    await handler(ctx, ws, msg);
  } else {
    ctx.send(ws, { type: 'error', code: 'unknown_message', message: 'Unknown message type' });
  }
}
