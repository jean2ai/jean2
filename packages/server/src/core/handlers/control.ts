import type { ServerWebSocket } from 'bun';
import type { RouterContext } from '../router-context';
import { sendGateRejection } from '../router-context';
import {
  handleClaim,
  handleRelease,
  handleRequestTakeover,
  handleRespondTakeover,
  buildControlUpdatedMessage,
  checkControllerGate,
} from '../session-control-registry';
import { getAutoApproveTakeover } from '@/env';
import type {
  SessionControlClaimMessage,
  SessionControlReleaseMessage,
  SessionControlRequestTakeoverMessage,
  SessionControlRespondTakeoverMessage,
} from '@jean2/sdk';

export function handleClaimMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: SessionControlClaimMessage,
): void {
  const result = handleClaim(msg.sessionId, ws);
  if (result.success) {
    ctx.broadcastToSession(msg.sessionId, buildControlUpdatedMessage(msg.sessionId, result.transitionReason));
  } else {
    ctx.send(ws, { type: 'error', code: result.code, message: result.error });
  }
}

export function handleReleaseMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: SessionControlReleaseMessage,
): void {
  const result = handleRelease(msg.sessionId, ws);
  if (result.success) {
    ctx.broadcastToSession(msg.sessionId, buildControlUpdatedMessage(msg.sessionId, result.transitionReason));
  } else {
    ctx.send(ws, { type: 'error', code: result.code, message: result.error });
  }
}

export function handleRequestTakeoverMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: SessionControlRequestTakeoverMessage,
): void {
  const result = handleRequestTakeover(msg.sessionId, ws, getAutoApproveTakeover());
  if (result.success) {
    ctx.broadcastToSession(msg.sessionId, buildControlUpdatedMessage(msg.sessionId, result.transitionReason));
  } else {
    ctx.send(ws, { type: 'error', code: result.code, message: result.error });
  }
}

export function handleRespondTakeoverMessage(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: SessionControlRespondTakeoverMessage,
): void {
  const result = handleRespondTakeover(msg.sessionId, ws, msg.requesterClientId, msg.decision);
  if (result.success) {
    ctx.broadcastToSession(msg.sessionId, buildControlUpdatedMessage(msg.sessionId, result.transitionReason));
  } else {
    ctx.send(ws, { type: 'error', code: result.code, message: result.error });
  }
}

export { checkControllerGate, sendGateRejection };
