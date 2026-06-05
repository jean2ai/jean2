import type { ClientMessage, AttachmentKind } from '../shared';

export class QueueNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  add(
    sessionId: string,
    content: string,
    options?: {
      attachments?: Array<{ id: string; kind: AttachmentKind }>;
      responseFormatId?: string;
    },
  ): void {
    this.send({
      type: 'queue.add',
      sessionId,
      content,
      ...(options?.attachments && options.attachments.length > 0 ? { attachments: options.attachments } : {}),
      ...(options?.responseFormatId ? { responseFormatId: options.responseFormatId } : {}),
    });
  }

  remove(queueId: string): void {
    this.send({ type: 'queue.remove', queueId });
  }
}
