import type { ServerMessage } from '@jean2/sdk';
import type { Session } from '@jean2/sdk';

type BroadcastCallback = (message: ServerMessage, excludeWs?: unknown) => void;

let broadcastCallback: BroadcastCallback | null = null;

export function registerBroadcastCallback(callback: BroadcastCallback): void {
  broadcastCallback = callback as BroadcastCallback;
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
