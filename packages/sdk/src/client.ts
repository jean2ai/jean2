import type { ClientConfig, ClientMessage } from './types';
import { TypedEventEmitter } from './emitter';
import type { SdkEventMap } from './types/server-messages';
import { routeServerMessage } from './types/server-messages';
import { WebSocketTransport } from './transport/websocket';
import { HttpClient } from './transport/http';
import { SessionsNamespace } from './namespaces/sessions';
import { ChatNamespace } from './namespaces/chat';

export class Jean2Client extends TypedEventEmitter<SdkEventMap> {
  private config: ClientConfig;
  private transport: WebSocketTransport;
  private http: HttpClient;
  private _state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' = 'disconnected';

  readonly sessions: SessionsNamespace;
  readonly chat: ChatNamespace;

  constructor(config: ClientConfig) {
    super();
    this.config = config;
    this.transport = new WebSocketTransport({
      url: config.url,
      token: config.token,
      wsConstructor: config.wsConstructor,
    });
    this.http = new HttpClient({
      url: config.url,
      token: config.token,
      apiBase: config.apiBase,
    });

    const send = this.transport.send.bind(this.transport);
    this.sessions = new SessionsNamespace(send);
    this.chat = new ChatNamespace(send);

    this.transport.onOpen = () => {
      this._state = 'connected';
      this.emit('connected');
      this.emit('*', { source: 'lifecycle', type: 'connected', payload: undefined });
    };

    this.transport.onMessage = (msg) => {
      routeServerMessage(this, msg);
    };

    this.transport.onClose = (code, reason, wasClean) => {
      const prevState = this._state;
      this._state = 'disconnected';
      if (prevState !== 'disconnected') {
        this.emit('disconnected', { code, reason, wasClean });
        this.emit('*', { source: 'lifecycle', type: 'disconnected', payload: { code, reason, wasClean } });
      }
    };

    this.transport.onError = (error) => {
      this.emit('error.connection', error);
      this.emit('*', { source: 'lifecycle', type: 'error.connection', payload: error });
    };
  }

  async connect(): Promise<void> {
    this._state = 'connecting';
    await this.transport.connect();
    if (this.config.autoSyncPermissions !== false) {
      this.transport.send({ type: 'permissions.sync' });
    }
  }

  async disconnect(): Promise<void> {
    this._state = 'disconnecting';
    await this.transport.disconnect();
  }

  dispose(): void {
    this.transport.dispose();
    this.removeAllListeners();
  }

  get state(): 'disconnected' | 'connecting' | 'connected' | 'disconnecting' {
    return this._state;
  }

  get connected(): boolean {
    return this._state === 'connected';
  }

  get ws(): WebSocket | null {
    return this.transport.ws;
  }

  send(message: ClientMessage): void {
    this.transport.send(message);
  }
}
