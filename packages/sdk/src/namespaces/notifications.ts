import type { ClientMessage } from '../shared';

export class NotificationsNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  acknowledge(eventId: string, sessionId: string): void {
    this.send({
      type: 'notification.acknowledge',
      eventId,
      sessionId,
    });
  }
}
