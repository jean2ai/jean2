import type {
  Message,
  Part,
  MessageWithParts,
  PartField,
  AssistantMessage,
  TextPart,
  ReasoningPart,
} from '../types';
import type { Jean2Client } from '../client';
import type { SdkEventMap } from '../types/server-messages';
import { TypedEventEmitter } from '../emitter';
import { LruMap } from './lru-map';
import type { MessageStoreOptions, MessageStoreEventMap } from '../types/state-types';

type EventHandler = (...args: unknown[]) => void;

export class MessageStore extends TypedEventEmitter<MessageStoreEventMap> {
  private readonly client: Jean2Client;
  private readonly sessionMessages: LruMap<string, Message[]>;
  private readonly parts: Map<string, Part> = new Map();
  private readonly partSessionIndex: Map<string, Set<string>> = new Map();
  private readonly streamingSessions: Set<string> = new Set();
  private subscriptions: Array<{ event: string; handler: EventHandler }> = [];
  private _disposed = false;
  private _version = 0;

  constructor(client: Jean2Client, options: MessageStoreOptions = {}) {
    super();
    this.client = client;
    this.sessionMessages = new LruMap<string, Message[]>(options.maxSessions ?? 100);
    this.sessionMessages.onEvict = (sessionId) => this.onEvict(sessionId);
    this.subscribe();
  }

  private subscribe(): void {
    const addSubscription = (event: string, handler: EventHandler) => {
      this.client.on(event as keyof SdkEventMap & string, handler);
      this.subscriptions.push({ event, handler });
    };

    addSubscription('session.resumed', (...args) => {
      const session = args[0] as SdkEventMap['session.resumed'][0];
      const messages = args[1] as SdkEventMap['session.resumed'][1];
      this.handleResumed(session.id, messages);
    });

    addSubscription('session.state', (...args) => {
      const sessionId = args[0] as SdkEventMap['session.state'][0];
      const messages = args[1] as SdkEventMap['session.state'][1];
      this.handleState(sessionId, messages);
    });

    addSubscription('session.forked', (...args) => {
      const _originalId = args[0] as SdkEventMap['session.forked'][0];
      const forkedSession = args[1] as SdkEventMap['session.forked'][1];
      const messages = args[2] as SdkEventMap['session.forked'][2];
      this.handleForked(forkedSession.id, messages);
    });

    addSubscription('session.reverted', (...args) => {
      const sessionId = args[0] as SdkEventMap['session.reverted'][0];
      this.handleReverted(sessionId);
    });

    addSubscription('session.interrupted', (...args) => {
      const sessionId = args[0] as SdkEventMap['session.interrupted'][0];
      this.handleInterrupted(sessionId);
    });

    addSubscription('message.created', (...args) => {
      const message = args[0] as SdkEventMap['message.created'][0];
      this.handleMessageCreated(message);
    });

    addSubscription('message.updated', (...args) => {
      const message = args[0] as SdkEventMap['message.updated'][0];
      this.handleMessageUpdated(message);
    });

    addSubscription('part.created', (...args) => {
      const sessionId = args[0] as SdkEventMap['part.created'][0];
      const part = args[1] as SdkEventMap['part.created'][1];
      this.handlePartCreated(sessionId, part);
    });

    addSubscription('part.updated', (...args) => {
      const sessionId = args[0] as SdkEventMap['part.updated'][0];
      const part = args[1] as SdkEventMap['part.updated'][1];
      this.handlePartUpdated(sessionId, part);
    });

    addSubscription('part.append', (...args) => {
      const sessionId = args[0] as SdkEventMap['part.append'][0];
      const partId = args[1] as SdkEventMap['part.append'][1];
      const field = args[2] as SdkEventMap['part.append'][2];
      const delta = args[3] as SdkEventMap['part.append'][3];
      this.handlePartAppend(sessionId, partId, field, delta);
    });
  }

  private handleResumed(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    if (this._disposed) return;
    this.replaceSessionMessages(sessionId, messagesWithParts);
    this.bumpVersion();
  }

  private handleState(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    if (this._disposed) return;
    this.replaceSessionMessages(sessionId, messagesWithParts);
    this.bumpVersion();
  }

  private handleForked(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    if (this._disposed) return;
    this.replaceSessionMessages(sessionId, messagesWithParts);
    this.bumpVersion();
  }

  private replaceSessionMessages(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    this.clearSessionParts(sessionId);

    const messages: Message[] = [];
    for (const { message, parts } of messagesWithParts) {
      // Populate partIds on the message for later lookups
      const messageWithParts = {
        ...message,
        partIds: parts.map(p => p.id),
      };
      messages.push(messageWithParts);
      for (const part of parts) {
        this.indexPart(sessionId, part);
      }
    }
    this.sessionMessages.set(sessionId, messages);
  }

  private indexPart(sessionId: string, part: Part): void {
    this.parts.set(part.id, part);
    let partIds = this.partSessionIndex.get(sessionId);
    if (!partIds) {
      partIds = new Set();
      this.partSessionIndex.set(sessionId, partIds);
    }
    partIds.add(part.id);
  }

  private handleReverted(sessionId: string): void {
    if (this._disposed) return;
    this.clearSessionParts(sessionId);
    this.sessionMessages.delete(sessionId);
    this.emit('session:cleared', sessionId);
    this.bumpVersion();
  }

  private handleInterrupted(sessionId: string): void {
    if (this._disposed) return;
    this.streamingSessions.delete(sessionId);
    this.bumpVersion();
  }

  private handleMessageCreated(message: Message): void {
    if (this._disposed) return;
    const sessionId = message.sessionId;
    let messages = this.sessionMessages.get(sessionId);
    if (!messages) {
      messages = [];
      this.sessionMessages.set(sessionId, messages);
    }
    const messageWithParts = {
      ...message,
      partIds: message.partIds ?? [],
    };
    messages.push(messageWithParts);

    if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      if (assistantMessage.status === 'streaming') {
        this.streamingSessions.add(sessionId);
      }
    }

    this.emit('message:created', message, sessionId);
    this.bumpVersion();
  }

  private handleMessageUpdated(message: Message): void {
    if (this._disposed) return;
    const sessionId = message.sessionId;
    const messages = this.sessionMessages.get(sessionId);
    if (!messages) return;

    const index = messages.findIndex((m) => m.id === message.id);
    if (index !== -1) {
      const existingMessage = messages[index];
      const updatedMessage = {
        ...message,
        partIds: message.partIds?.length ? message.partIds : existingMessage.partIds,
      };
      messages[index] = updatedMessage;
    }

    if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      if (assistantMessage.status === 'completed') {
        this.streamingSessions.delete(sessionId);
      }
    }

    this.emit('message:updated', message, sessionId);
    this.bumpVersion();
  }

  private handlePartCreated(sessionId: string, part: Part): void {
    if (this._disposed) return;
    this.indexPart(sessionId, part);
    const messages = this.sessionMessages.get(sessionId);
    if (messages) {
      const targetMessage = messages.find((m) => m.id === part.messageId);
      if (targetMessage && !targetMessage.partIds.includes(part.id)) {
        targetMessage.partIds.push(part.id);
      }
    }
    this.bumpVersion();
  }

  private handlePartUpdated(sessionId: string, part: Part): void {
    if (this._disposed) return;
    this.parts.set(part.id, part);
    this.bumpVersion();
  }

  private handlePartAppend(
    sessionId: string,
    partId: string,
    field: PartField,
    delta: string,
  ): void {
    if (this._disposed) return;
    const part = this.parts.get(partId);
    if (!part) return;

    if (field === 'text' && part.type === 'text') {
      (part as TextPart).text += delta;
    } else if (field === 'reasoning' && part.type === 'reasoning') {
      (part as ReasoningPart).text += delta;
    }

    this.emit('message:appended', sessionId, partId, field, delta);
    this.bumpVersion();
  }

  private onEvict(sessionId: string): void {
    const partIds = this.partSessionIndex.get(sessionId);
    if (partIds) {
      for (const partId of partIds) {
        this.parts.delete(partId);
      }
      this.partSessionIndex.delete(sessionId);
    }

    this.streamingSessions.delete(sessionId);
    this.emit('session:cleared', sessionId);
  }

  private clearSessionParts(sessionId: string): void {
    const partIds = this.partSessionIndex.get(sessionId);
    if (partIds) {
      for (const partId of partIds) {
        this.parts.delete(partId);
      }
      this.partSessionIndex.delete(sessionId);
    }
  }

  getForSession(sessionId: string): Message[] | undefined {
    return this.sessionMessages.get(sessionId);
  }

  getPart(partId: string): Part | undefined {
    return this.parts.get(partId);
  }

  isStreaming(sessionId: string): boolean {
    return this.streamingSessions.has(sessionId);
  }

  getStreamingSessions(): string[] {
    return Array.from(this.streamingSessions);
  }

  hasSession(sessionId: string): boolean {
    return this.sessionMessages.has(sessionId);
  }

  get version(): number {
    return this._version;
  }

  private bumpVersion(): void {
    this._version++;
  }

  clearSession(sessionId: string): boolean {
    if (!this.sessionMessages.has(sessionId)) return false;
    this.clearSessionParts(sessionId);
    this.streamingSessions.delete(sessionId);
    this.sessionMessages.delete(sessionId);
    this.emit('session:cleared', sessionId);
    return true;
  }

  clear(): void {
    this.sessionMessages.clear();
    this.parts.clear();
    this.partSessionIndex.clear();
    this.streamingSessions.clear();
  }

  dispose(): void {
    this._disposed = true;
    for (const { event, handler } of this.subscriptions) {
      this.client.off(event as keyof SdkEventMap & string, handler as (...args: unknown[]) => void);
    }
    this.subscriptions = [];
    this.removeAllListeners();
    this.clear();
  }
}
