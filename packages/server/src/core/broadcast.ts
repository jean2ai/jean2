import type { ServerMessage, Session, AskAuthority } from '@jean2/sdk';
import { resolveAskDeliveryTargets } from './capability-router';

export type BroadcastFn = (message: ServerMessage) => void;

export type BroadcastSessionFn = (session: Session) => void;

export type SendToControllerFn = (sessionId: string, message: ServerMessage) => void;

export type BroadcastToSessionFn = (sessionId: string, message: ServerMessage) => void;

export type SendToAskTargetsFn = (
  sessionId: string,
  authority: AskAuthority,
  message: ServerMessage,
) => void;

type BroadcastCallback = (message: ServerMessage, excludeWs?: unknown) => void;

let broadcastCallback: BroadcastCallback | null = null;
let sendToControllerCallback: SendToControllerFn | null = null;
let broadcastToSessionCallback: BroadcastToSessionFn | null = null;
let sendToAskTargetsCallback: ((ws: unknown, msg: ServerMessage) => void) | null = null;

export function registerBroadcastCallback(callback: BroadcastCallback): void {
  broadcastCallback = callback as BroadcastCallback;
}

export function registerSendToControllerCallback(callback: SendToControllerFn): void {
  sendToControllerCallback = callback;
}

export function registerBroadcastToSessionCallback(callback: BroadcastToSessionFn): void {
  broadcastToSessionCallback = callback;
}

export function registerSendToAskTargetsCallback(
  sendFn: (ws: unknown, msg: ServerMessage) => void,
): void {
  sendToAskTargetsCallback = sendFn;
}

export function broadcastSessionCreated(session: Session): void {
  if (!broadcastCallback) {
    console.error('Broadcast callback not registered. Call registerBroadcastCallback first.');
    return;
  }

  broadcastCallback({
    type: 'session.created',
    session,
  });
}

export function broadcastSessionCreatedExclude(session: Session, excludeWs: unknown): void {
  if (!broadcastCallback) {
    console.error('Broadcast callback not registered. Call registerBroadcastCallback first.');
    return;
  }

  broadcastCallback({
    type: 'session.created',
    session,
  }, excludeWs);
}

export function broadcastSessionUpdated(session: Session): void {
  if (!broadcastCallback) {
    console.error('Broadcast callback not registered. Call registerBroadcastCallback first.');
    return;
  }

  broadcastCallback({
    type: 'session.updated',
    session,
  });
}

export function broadcastEvent(message: ServerMessage): void {
  if (!broadcastCallback) return;
  broadcastCallback(message);
}

export function sendToControllerEvent(sessionId: string, message: ServerMessage): void {
  if (!sendToControllerCallback) {
    broadcastEvent(message);
    return;
  }
  sendToControllerCallback(sessionId, message);
}

export function broadcastToSessionEvent(sessionId: string, message: ServerMessage): void {
  if (!broadcastToSessionCallback) {
    broadcastEvent(message);
    return;
  }
  broadcastToSessionCallback(sessionId, message);
}

/**
 * Send an ask to the delivery targets resolved from the ask's authority.
 *
 * For controller_only authority (the default), this falls back to
 * sendToControllerEvent. For designated_clients or first_eligible with
 * required capabilities, it resolves the correct set of connections.
 */
export function sendToAskTargetsEvent(
  sessionId: string,
  authority: AskAuthority,
  message: ServerMessage,
): void {
  if (!sendToAskTargetsCallback) {
    // Fallback: use controller-only delivery
    sendToControllerEvent(sessionId, message);
    return;
  }

  const targets = resolveAskDeliveryTargets(sessionId, authority);

  if (targets.connections.length === 0) {
    // No capability-aware targets found — fall back to controller delivery
    sendToControllerEvent(sessionId, message);
    return;
  }

  for (const conn of targets.connections) {
    sendToAskTargetsCallback(conn.ws, message);
  }
}
