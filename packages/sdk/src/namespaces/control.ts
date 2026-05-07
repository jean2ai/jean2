import type { ClientMessage, TakeoverDecision } from '../shared-protocol/client';

export class ControlNamespace {
  private send: (msg: ClientMessage) => void;

  constructor(send: (msg: ClientMessage) => void) {
    this.send = send;
  }

  claim(sessionId: string): void {
    this.send({
      type: 'session.control.claim',
      sessionId,
    });
  }

  release(sessionId: string): void {
    this.send({
      type: 'session.control.release',
      sessionId,
    });
  }

  requestTakeover(sessionId: string): void {
    this.send({
      type: 'session.control.request_takeover',
      sessionId,
    });
  }

  respondTakeover(sessionId: string, requesterClientId: string, decision: TakeoverDecision): void {
    this.send({
      type: 'session.control.respond_takeover',
      sessionId,
      requesterClientId,
      decision,
    });
  }
}
