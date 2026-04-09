import type { ClientMessage } from '../protocol/client';
import type { ChatMessageAttachment } from '../protocol/client';
import type { AttachmentKind } from '../types';

export class QueueNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  add(
    sessionId: string,
    content: string,
    attachments?: Array<{ id: string; kind: AttachmentKind }>,
  ): void {
    const msg: ChatMessageAttachment[] | undefined = attachments;
    this.send({
      type: 'queue.add',
      sessionId,
      content,
      ...(msg && msg.length > 0 ? { attachments: msg } : {}),
    });
  }

  remove(queueId: string): void {
    this.send({ type: 'queue.remove', queueId });
  }
}
