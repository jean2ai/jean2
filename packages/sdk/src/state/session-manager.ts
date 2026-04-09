import type { Jean2Client } from '../client';
import type { Session } from '../types';
import type { SessionManagerOptions, SessionManagerEventMap } from '../types/state-types';
import { TypedEventEmitter } from '../emitter';
import { LruMap } from './lru-map';

type SessionClientEvents = {
  'session.created': [session: Session];
  'session.resumed': [session: Session, messages: unknown[], usage: unknown, isRunning: boolean];
  'session.updated': [session: Session];
  'session.renamed': [session: Session];
  'session.reopened': [session: Session];
  'session.closed': [sessionId: string];
  'session.deleted': [sessionId: string];
  'session.forked': [originalSessionId: string, forkedSession: Session, messages: unknown[]];
};

export class SessionManager extends TypedEventEmitter<SessionManagerEventMap> {
  private sessions: LruMap<string, Session>;
  private _activeSessionId: string | null = null;
  private _disposed = false;
  private _version = 0;
  private _client: Jean2Client;
  private _handlers: Array<{
    event: keyof SessionClientEvents;
    handler: (...args: unknown[]) => void;
  }>;

  constructor(client: Jean2Client, options?: SessionManagerOptions) {
    super();
    this._client = client;
    const maxSessions = options?.maxSessions ?? 100;
    this.sessions = new LruMap<string, Session>(maxSessions);

    this.sessions.onEvict = (id) => {
      this.emit('session:removed', id);
      if (this._activeSessionId === id) {
        this._activeSessionId = null;
        this.emit('session:active', null);
      }
    };

    this._handlers = [
      {
        event: 'session.created',
        handler: ((session: Session) => this.handleCreated(session)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.resumed',
        handler: ((session: Session) => this.handleCreated(session)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.updated',
        handler: ((session: Session) => this.handleUpdated(session)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.renamed',
        handler: ((session: Session) => this.handleUpdated(session)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.reopened',
        handler: ((session: Session) => this.handleUpdated(session)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.closed',
        handler: ((sessionId: string) => this.handleClosed(sessionId)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.deleted',
        handler: ((sessionId: string) => this.handleDeleted(sessionId)) as unknown as (...args: unknown[]) => void,
      },
      {
        event: 'session.forked',
        handler: ((_originalId: string, forked: Session) => this.handleCreated(forked)) as unknown as (...args: unknown[]) => void,
      },
    ];

    for (const { event, handler } of this._handlers) {
      this._client.on(event, handler as Parameters<Jean2Client['on']>[1]);
    }
  }

  private handleCreated(session: Session): void {
    if (this._disposed) return;
    this.sessions.set(session.id, session);
    if (!this._activeSessionId) {
      this.setActive(session.id);
    }
    this.bumpVersion();
    this.emit('session:created', session);
  }

  private handleUpdated(session: Session): void {
    if (this._disposed) return;
    this.sessions.set(session.id, session);
    this.bumpVersion();
    this.emit('session:updated', session);
  }

  private handleClosed(sessionId: string): void {
    if (this._disposed) return;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      this.sessions.set(sessionId, session);
      this.bumpVersion();
      this.emit('session:updated', session);
    }
  }

  private handleDeleted(sessionId: string): void {
    if (this._disposed) return;
    this.sessions.delete(sessionId);
    if (this._activeSessionId === sessionId) {
      this._activeSessionId = null;
      this.emit('session:active', null);
    }
    this.bumpVersion();
    this.emit('session:removed', sessionId);
  }

  private bumpVersion(): void {
    this._version++;
  }

  get version(): number {
    return this._version;
  }

  load(sessions: Session[]): void {
    if (this._disposed) return;
    this.sessions.clear();
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }
    this.bumpVersion();
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  get active(): Session | null {
    if (!this._activeSessionId) return null;
    return this.sessions.peek(this._activeSessionId) ?? null;
  }

  setActive(id: string): void {
    if (!this.sessions.has(id)) return;
    this._activeSessionId = id;
    this.sessions.get(id);
    this.emit('session:active', this.sessions.peek(id) ?? null);
  }

  clearActive(): void {
    this._activeSessionId = null;
    this.emit('session:active', null);
  }

  clear(): void {
    const ids = Array.from(this.sessions.keys());
    this.sessions.clear();
    this._activeSessionId = null;
    for (const id of ids) {
      this.emit('session:removed', id);
    }
    this.emit('session:active', null);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const { event, handler } of this._handlers) {
      this._client.off(event, handler as Parameters<Jean2Client['off']>[1]);
    }
    this._handlers = [];
    this.sessions.clear();
    this._activeSessionId = null;
    this.removeAllListeners();
  }
}
