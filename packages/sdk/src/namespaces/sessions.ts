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

  close(sessionId: string): void {
    this.send({ type: 'session.close', sessionId });
  }

  update(sessionId: string, options?: { preconfigId?: string }): void {
    this.send({ type: 'session.update', sessionId, ...options });
  }

  updatePreconfig(sessionId: string, preconfigId: string): void {
    this.update(sessionId, { preconfigId });
  }

  updateModel(
    sessionId: string,
    options: { modelId: string; providerId: string; variant?: string },
  ): void {
    this.send({ type: 'session.update_model', sessionId, ...options });
  }

  reopen(sessionId: string): void {
    this.send({ type: 'session.reopen', sessionId });
  }

  delete(sessionId: string): void {
    this.send({ type: 'session.delete', sessionId });
  }

  rename(sessionId: string, title: string): void {
    this.send({ type: 'session.rename', sessionId, title });
  }

  compact(sessionId: string): void {
    this.send({ type: 'session.compact', sessionId });
  }

  revert(sessionId: string, messageId: string): void {
    this.send({ type: 'session.revert', sessionId, messageId });
  }

  fork(sessionId: string, messageId: string, title?: string): void {
    this.send({ type: 'session.fork', sessionId, messageId, title });
  }

  interrupt(
    sessionId: string,
    reason?: 'user_request' | 'timeout' | 'error',
  ): void {
    this.send({ type: 'session.interrupt', sessionId, reason });
  }
}
