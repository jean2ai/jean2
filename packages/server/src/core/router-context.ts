import type { ServerMessage, AskAuthority } from '@jean2/sdk';
import type { ServerWebSocket } from 'bun';
import { checkControllerGate } from './session-control-registry';

export interface ClientEntry {
  sessionIds: Set<string>;
  missedPings: number;
}

export interface RouterContext {
  send: (ws: ServerWebSocket, msg: ServerMessage) => void;
  broadcast: (message: ServerMessage, excludeWs?: ServerWebSocket) => void;
  broadcastToSession: (sessionId: string, message: ServerMessage, excludeWs?: ServerWebSocket) => void;
  sendToController: (sessionId: string, message: ServerMessage) => void;
  sendToAskTargets: (sessionId: string, authority: AskAuthority, message: ServerMessage) => void;
  clients: Map<ServerWebSocket, ClientEntry>;
}

export function sendGateRejection(
  ctx: RouterContext,
  ws: ServerWebSocket,
  rejection: NonNullable<ReturnType<typeof checkControllerGate>>,
): true {
  ctx.send(ws, {
    type: 'session.action_rejected',
    sessionId: rejection.sessionId,
    action: rejection.action,
    code: rejection.code,
    message: rejection.message,
    control: rejection.control,
  });
  return true;
}
