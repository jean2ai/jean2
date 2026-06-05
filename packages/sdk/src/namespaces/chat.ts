import type { ClientMessage, ChatMessage, AttachmentKind } from '../shared';

export class ChatNamespace {
  constructor(private _send: (msg: ClientMessage) => void) {}

  send(
    sessionId: string,
    content: string,
    options?: {
      attachments?: Array<{ id: string; kind: AttachmentKind }>;
      responseFormatId?: string;
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
    if (options?.responseFormatId) {
      msg.responseFormatId = options.responseFormatId;
    }
    this._send(msg);
  }
}
