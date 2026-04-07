import type { ClientMessage } from '@jean2/shared';

export class SessionsNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  create(options?: {
    workspaceId?: string;
    preconfigId?: string;
    title?: string;
  }): void {
    this.send({ type: 'session.create', ...options });
  }

  resume(sessionId: string): void {
    this.send({ type: 'session.resume', sessionId });
  }
}
