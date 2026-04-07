import type { ClientMessage, ServerMessage } from '@jean2/shared';
import { ConnectionError } from '../errors';

export interface WebSocketTransportConfig {
  url: string;
  token: string;
  wsConstructor?: typeof WebSocket;
  connectionTimeout?: number;
}

export type WsState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export class WebSocketTransport {
  private _ws: WebSocket | null = null;
  private config: WebSocketTransportConfig;
  private _state: WsState = 'disconnected';

  onOpen: (() => void) | null = null;
  onMessage: ((message: ServerMessage) => void) | null = null;
  onClose: ((code: number, reason: string, wasClean: boolean) => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  constructor(config: WebSocketTransportConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const WsConstructor = this.config.wsConstructor ?? globalThis.WebSocket;
      const wsUrl = this.buildWsUrl();

      this._state = 'connecting';
      this._ws = new WsConstructor(wsUrl);

      const timeoutMs = this.config.connectionTimeout ?? 10000;
      const timeoutId = setTimeout(() => {
        this._ws?.close(1001, 'Connection timeout');
        reject(new ConnectionError(`Connection timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      this._ws.onopen = () => {
        clearTimeout(timeoutId);
        this._state = 'connected';
        this.onOpen?.();
        resolve();
      };

      this._ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          this.onMessage?.(message);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.onError?.(new Error(`Failed to parse WebSocket message: ${message}`));
        }
      };

      this._ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeoutId);
        this._state = 'disconnected';
        if (this._ws !== null) {
          reject(new ConnectionError(`Connection closed before open: code=${event.code}, reason=${event.reason}`));
        }
        this._ws = null;
        this.onClose?.(event.code, event.reason, event.wasClean);
      };

      this._ws.onerror = () => {
        clearTimeout(timeoutId);
        this.onError?.(new Error('WebSocket error'));
        reject(new ConnectionError('WebSocket error'));
      };
    });
  }

  send(message: ClientMessage): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new ConnectionError('WebSocket is not connected');
    }
    this._ws.send(JSON.stringify(message));
  }

  async disconnect(): Promise<void> {
    if (!this._ws) return;
    return new Promise((resolve) => {
      this._state = 'disconnecting';
      const ws = this._ws!;
      const handler = () => {
        ws.removeEventListener('close', handler);
        resolve();
      };
      ws.addEventListener('close', handler);
      ws.close(1000, 'Client disconnect');
    });
  }

  dispose(): void {
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = null;
    }
    this._state = 'disconnected';
  }

  get connected(): boolean {
    return this._state === 'connected';
  }

  get readyState(): number {
    return this._ws?.readyState ?? WebSocket.CLOSED;
  }

  get ws(): WebSocket | null {
    return this._ws;
  }

  private buildWsUrl(): string {
    const proto = this.config.url.startsWith('https') ? 'wss' : 'ws';
    const clean = this.config.url.replace(/^https?:\/\//, '');
    return `${proto}://${clean}/ws?token=${encodeURIComponent(this.config.token)}`;
  }
}
