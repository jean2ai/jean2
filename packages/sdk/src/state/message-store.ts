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
    this.replaceSessionMessages(sessionId, messagesWithParts);
  }

  private handleState(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    this.replaceSessionMessages(sessionId, messagesWithParts);
  }

  private handleForked(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    this.replaceSessionMessages(sessionId, messagesWithParts);
  }

  private replaceSessionMessages(sessionId: string, messagesWithParts: MessageWithParts[]): void {
    this.clearSessionParts(sessionId);

    const messages: Message[] = [];
    for (const { message, parts } of messagesWithParts) {
      messages.push(message);
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
    this.clearSessionParts(sessionId);
    this.sessionMessages.delete(sessionId);
    this.emit('session:cleared', sessionId);
  }

  private handleInterrupted(sessionId: string): void {
    this.streamingSessions.delete(sessionId);
  }

  private handleMessageCreated(message: Message): void {
    const sessionId = message.sessionId;
    let messages = this.sessionMessages.get(sessionId);
    if (!messages) {
      messages = [];
      this.sessionMessages.set(sessionId, messages);
    }
    messages.push(message);

    if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      if (assistantMessage.status === 'streaming') {
        this.streamingSessions.add(sessionId);
      }
    }
  }

  private handleMessageUpdated(message: Message): void {
    const sessionId = message.sessionId;
    const messages = this.sessionMessages.get(sessionId);
    if (!messages) return;

    const index = messages.findIndex((m) => m.id === message.id);
    if (index !== -1) {
      messages[index] = message;
    }

    if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      if (assistantMessage.status === 'completed') {
        this.streamingSessions.delete(sessionId);
      }
    }
  }

  private handlePartCreated(sessionId: string, part: Part): void {
    this.indexPart(sessionId, part);
  }

  private handlePartUpdated(sessionId: string, part: Part): void {
    this.parts.set(part.id, part);
  }

  private handlePartAppend(
    sessionId: string,
    partId: string,
    field: PartField,
    delta: string,
  ): void {
    const part = this.parts.get(partId);
    if (!part) return;

    if (field === 'text' && part.type === 'text') {
      (part as TextPart).text += delta;
    } else if (field === 'reasoning' && part.type === 'reasoning') {
      (part as ReasoningPart).text += delta;
    }

    this.emit('message:appended', sessionId, partId, field, delta);
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
    for (const { event, handler } of this.subscriptions) {
      this.client.off(event as keyof SdkEventMap & string, handler as (...args: unknown[]) => void);
    }
    this.subscriptions = [];
    this.removeAllListeners();
    this.clear();
  }
}
