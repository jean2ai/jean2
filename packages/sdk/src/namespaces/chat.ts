import type { ClientMessage, ChatMessage, AttachmentKind } from '@jean2/shared';

export class ChatNamespace {
  constructor(private _send: (msg: ClientMessage) => void) {}

  send(
    sessionId: string,
    content: string,
    options?: {
      attachments?: Array<{ id: string; kind: AttachmentKind }>;
    },
  ): void {
    const msg: ChatMessage = {
      type: 'chat.message',
      sessionId,
      content,
    };
    if (options?.attachments && options.attachments.length > 0) {
      msg.attachments = options.attachments;
    }
    this._send(msg);
  }
}
