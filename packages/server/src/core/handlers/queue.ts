import type { ServerWebSocket } from 'bun';
import type { RouterContext } from '../router-context';
import { sendGateRejection } from '../router-context';
import { getSession, addMessageToQueue, getQueuedMessage, deleteQueuedMessage } from '@/store';
import { checkControllerGate } from '../session-control-registry';
import type { QueueAddMessage, QueueRemoveMessage } from '@jean2/sdk';

export function handleQueueAdd(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: QueueAddMessage,
): void {
  const session = getSession(msg.sessionId);
  if (!session) {
    ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found' });
    return;
  }
  const gate = checkControllerGate(msg.sessionId, 'queue.add', ws);
  if (gate) { sendGateRejection(ctx, ws, gate); return; }

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
}

export function handleQueueRemove(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: QueueRemoveMessage,
): void {
  const queuedMsg = getQueuedMessage(msg.queueId);
  if (!queuedMsg) {
    ctx.send(ws, { type: 'error', code: 'not_found', message: 'Queued message not found' });
    return;
  }
  const gate = checkControllerGate(queuedMsg.sessionId, 'queue.remove', ws);
  if (gate) { sendGateRejection(ctx, ws, gate); return; }

  deleteQueuedMessage(msg.queueId);

  ctx.send(ws, {
    type: 'queue.removed',
    sessionId: queuedMsg.sessionId,
    queueId: msg.queueId,
  });
}
