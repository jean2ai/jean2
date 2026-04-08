import type { ClientConfig, ClientMessage, ConnectionState } from './types';
import { TypedEventEmitter } from './emitter';
import type { SdkEventMap } from './types/server-messages';
import type { SdkEvent } from './types/sdk-types';
import { routeServerMessage } from './types/server-messages';
import { WebSocketTransport } from './transport/websocket';
import { HttpClient } from './transport/http';
import { SessionsNamespace } from './namespaces/sessions';
import { ChatNamespace } from './namespaces/chat';
import { PermissionsNamespace } from './namespaces/permissions';
import { QueueNamespace } from './namespaces/queue';
import { ProvidersNamespace } from './namespaces/providers';
import { TerminalNamespace } from './namespaces/terminal';
import { HttpNamespace } from './rest/http-namespace';

export class Jean2Client extends TypedEventEmitter<SdkEventMap> {
  private config: ClientConfig;
  private transport: WebSocketTransport;
  private _httpClient: HttpClient;
  private _state: ConnectionState = 'disconnected';
  private _disposed = false;

  readonly sessions: SessionsNamespace;
  readonly chat: ChatNamespace;
  readonly permissions: PermissionsNamespace;
  readonly queue: QueueNamespace;
  readonly providers: ProvidersNamespace;
  readonly http: HttpNamespace;
  readonly terminal: TerminalNamespace;

  constructor(config: ClientConfig) {
    super();
    this.config = config;
    this.transport = new WebSocketTransport({
      url: config.url,
      token: config.token,
      wsConstructor: config.wsConstructor,
      connectionTimeout: config.connectionTimeout,
      reconnect: config.reconnect,
      heartbeat: config.heartbeat,
    });
    this._httpClient = new HttpClient({
      url: config.url,
      token: config.token,
      apiBase: config.apiBase,
    });

    const send = this.transport.send.bind(this.transport);
    this.sessions = new SessionsNamespace(send);
    this.chat = new ChatNamespace(send);
    this.permissions = new PermissionsNamespace(send);
    this.queue = new QueueNamespace(send);
    this.providers = new ProvidersNamespace(send);
    this.http = new HttpNamespace(this._httpClient);
    this.terminal = new TerminalNamespace({
      url: config.url,
      token: config.token,
      wsConstructor: config.wsConstructor,
    });

    this.transport.onOpen = () => {
      this._state = 'connected';
      this.emit('connected');
      if (this.config.autoSyncPermissions !== false) {
        this.permissions.sync();
      }
    };

    this.transport.onMessage = (msg) => {
      routeServerMessage(this, msg);
    };

    this.transport.onClose = (code, reason, wasClean) => {
      const prevState = this._state;
      if (this._disposed || this._state === 'disconnecting') {
        this._state = 'disconnected';
        if (prevState !== 'disconnected') {
          this.emit('disconnected', { code, reason, wasClean });
        }
        return;
      }
      this._state = 'disconnected';
      if (prevState !== 'disconnected') {
        this.emit('disconnected', { code, reason, wasClean });
      }
    };

    this.transport.onError = (error) => {
      this.emit('error.connection', error);
    };

    this.transport.onReconnecting = (attempt, maxRetries) => {
      this._state = 'reconnecting';
      this.emit('reconnecting', { attempt, maxRetries });
    };
  }

  override emit<K extends keyof SdkEventMap & string>(
    event: K,
    ...args: SdkEventMap[K]
  ): boolean {
    const result = super.emit(event, ...args);
    if (event !== '*') {
      const lifecycleEvent = this.buildLifecycleWildcardEvent(event, args);
      if (lifecycleEvent) {
        super.emit('*' as keyof SdkEventMap & string, lifecycleEvent);
      }
    }
    return result;
  }

  private buildLifecycleWildcardEvent(
    event: string,
    args: unknown[],
  ): SdkEvent | null {
    switch (event) {
      case 'connected':
        return { source: 'lifecycle', type: 'connected', payload: undefined };
      case 'disconnected':
        return {
          source: 'lifecycle',
          type: 'disconnected',
          payload: args[0] as { code: number; reason: string; wasClean: boolean },
        };
      case 'reconnecting':
        return {
          source: 'lifecycle',
          type: 'reconnecting',
          payload: args[0] as { attempt: number; maxRetries: number },
        };
      case 'error.connection':
        return { source: 'lifecycle', type: 'error.connection', payload: args[0] as Error };
      default:
        return null;
    }
  }

  async connect(): Promise<void> {
    if (this._disposed) {
      throw new Error('Client has been disposed');
    }
    if (this._state === 'reconnecting') {
      return;
    }
    this._state = 'connecting';
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    this._state = 'disconnecting';
    await this.transport.disconnect();
    this._state = 'disconnected';
  }

  async dispose(): Promise<void> {
    this._disposed = true;
    await this.disconnect();
    this.transport.dispose();
    this.removeAllListeners();
  }

  get state(): ConnectionState {
    return this._state;
  }

  get connected(): boolean {
    return this._state === 'connected';
  }

  get reconnecting(): boolean {
    return this._state === 'reconnecting';
  }

  get ws(): WebSocket | null {
    return this.transport.ws;
  }

  get httpClient(): HttpClient {
    return this._httpClient;
  }

  send(message: ClientMessage): void {
    this.transport.send(message);
  }
}
