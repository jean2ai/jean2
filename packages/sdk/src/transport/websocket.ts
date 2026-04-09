import type { ClientMessage } from '../protocol/client';
import type { ServerMessage } from '../protocol/server';
import { ConnectionError } from '../errors';
import type { ReconnectOptions, HeartbeatOptions } from '../types/sdk-types';

export interface WebSocketTransportConfig {
  url: string;
  token: string;
  wsConstructor?: typeof WebSocket;
  connectionTimeout?: number;
  reconnect?: ReconnectOptions;
  heartbeat?: HeartbeatOptions;
}

export type WsState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'reconnecting';

const HEARTBEAT_DEFAULTS = {
  enabled: true,
  interval: 30000,
  timeout: 5000,
} as const;

const RECONNECT_DEFAULTS = {
  initialDelay: 1000,
  maxDelay: 30000,
  maxRetries: Infinity,
} as const;

export class WebSocketTransport {
  private _ws: WebSocket | null = null;
  private config: WebSocketTransportConfig;
  private reconnectConfig: Required<Omit<ReconnectOptions, 'reconnectOnVisibilityChange' | 'reconnectOnOnline'>>;
  private _state: WsState = 'disconnected';

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private pendingConnectPromise: Promise<void> | null = null;

  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private reconnectOnVisibilityChange: boolean;
  private reconnectOnOnline: boolean;

  /** Queue for outbound messages while disconnected/reconnecting with reconnect enabled. */
  private outboundQueue: ClientMessage[] = [];

  /** Heartbeat state */
  private heartbeatConfig: Required<Omit<HeartbeatOptions, 'enabled'>>;
  private heartbeatEnabled: boolean;
  private heartbeatPingTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatPongTimer: ReturnType<typeof setTimeout> | null = null;

  onOpen: (() => void) | null = null;
  onMessage: ((message: ServerMessage) => void) | null = null;
  onClose: ((code: number, reason: string, wasClean: boolean) => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onReconnecting: ((attempt: number, maxRetries: number) => void) | null = null;

  constructor(config: WebSocketTransportConfig) {
    this.config = config;
    const reconnect = config.reconnect;
    const reconnectEnabled = reconnect?.enabled ?? false;
    this.reconnectConfig = {
      enabled: reconnectEnabled,
      initialDelay: reconnect?.initialDelay ?? RECONNECT_DEFAULTS.initialDelay,
      maxDelay: reconnect?.maxDelay ?? RECONNECT_DEFAULTS.maxDelay,
      maxRetries: reconnect?.maxRetries ?? RECONNECT_DEFAULTS.maxRetries,
    };
    this.reconnectOnVisibilityChange = reconnect?.reconnectOnVisibilityChange ?? reconnectEnabled;
    this.reconnectOnOnline = reconnect?.reconnectOnOnline ?? reconnectEnabled;

    const heartbeat = config.heartbeat;
    this.heartbeatEnabled = heartbeat?.enabled ?? HEARTBEAT_DEFAULTS.enabled;
    this.heartbeatConfig = {
      interval: heartbeat?.interval ?? HEARTBEAT_DEFAULTS.interval,
      timeout: heartbeat?.timeout ?? HEARTBEAT_DEFAULTS.timeout,
    };
  }

  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }
    if (this.pendingConnectPromise) {
      return this.pendingConnectPromise;
    }

    this.intentionalClose = false;
    this._state = 'connecting';

    if (this.reconnectConfig.enabled) {
      this.attachBrowserListeners();
    }

    this.pendingConnectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.establishConnection();
    });

    try {
      await this.pendingConnectPromise;
    } finally {
      this.pendingConnectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;
    }
  }

  private establishConnection(): void {
    const WsConstructor = this.config.wsConstructor ?? globalThis.WebSocket;
    const wsUrl = this.buildWsUrl();

    this._ws = new WsConstructor(wsUrl);

    const timeoutMs = this.config.connectionTimeout ?? 10000;
    const timeoutId = setTimeout(() => {
      if (this._ws) {
        this._ws.close(1001, 'Connection timeout');
      }
      const err = new ConnectionError(`Connection timeout (${timeoutMs}ms)`);
      this.connectReject?.(err);
    }, timeoutMs);

    this._ws.onopen = () => {
      clearTimeout(timeoutId);
      this._state = 'connected';
      this.reconnectAttempt = 0;
      this.connectResolve?.();
      this.flushQueue();
      this.startHeartbeat();
      this.onOpen?.();
    };

    this._ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'pong') {
          this.handlePong();
        } else {
          this.onMessage?.(message);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.onError?.(new Error(`Failed to parse WebSocket message: ${message}`));
      }
    };

    this._ws.onclose = (event: CloseEvent) => {
      clearTimeout(timeoutId);
      this.stopHeartbeat();
      const prevState = this._state;
      this._ws = null;

      if (prevState === 'connecting') {
        this._state = 'disconnected';
        const err = new ConnectionError(`Connection closed before open: code=${event.code}, reason=${event.reason}`);
        this.connectReject?.(err);
        this.onClose?.(event.code, event.reason, event.wasClean);
        return;
      }

      this._state = 'disconnected';
      this.onClose?.(event.code, event.reason, event.wasClean);

      if (!this.intentionalClose && this.shouldAttemptReconnect(event.code)) {
        this.scheduleReconnect();
      }
    };

    this._ws.onerror = () => {
      clearTimeout(timeoutId);
      const err = new Error('WebSocket error');
      this.onError?.(err);
      this.connectReject?.(new ConnectionError('WebSocket error'));
    };
  }

  private reconnectNow(): void {
    if (this._state !== 'disconnected' || this.intentionalClose) {
      return;
    }
    this.scheduleReconnect();
  }

  /**
   * Handle pong response from server.
   * Clears pong timer and ping timer, schedules next ping.
   */
  private handlePong(): void {
    if (this.heartbeatPongTimer !== null) {
      clearTimeout(this.heartbeatPongTimer);
      this.heartbeatPongTimer = null;
    }
    this.scheduleNextPing();
  }

  /**
   * Schedule the next ping after the configured interval.
   */
  private scheduleNextPing(): void {
    if (!this.heartbeatEnabled || this._state !== 'connected') {
      return;
    }
    this.heartbeatPingTimer = setTimeout(() => {
      this.heartbeatPingTimer = null;
      if (this._state === 'connected' && this._ws?.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, this.heartbeatConfig.interval);
  }

  /**
   * Send a ping message and start pong timeout.
   * If pong not received within timeout, triggers stale connection handling.
   */
  private sendPing(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this._ws.send(JSON.stringify({ type: 'ping' }));
      this.heartbeatPongTimer = setTimeout(() => {
        this.heartbeatPongTimer = null;
        if (this._state === 'connected') {
          this.handleStaleHeartbeat();
        }
      }, this.heartbeatConfig.timeout);
    } catch (_err: unknown) {
      // Connection may have closed; will reconnect via onclose
    }
  }

  /**
   * Handle stale heartbeat - connection is unresponsive.
   * Forces reconnect by closing the socket.
   */
  private handleStaleHeartbeat(): void {
    console.warn('[WebSocketTransport] Heartbeat stale - forcing reconnect');
    if (this._ws) {
      this._ws.close(1001, 'Heartbeat stale');
    }
  }

  /**
   * Start heartbeat on successful connection.
   */
  private startHeartbeat(): void {
    if (!this.heartbeatEnabled) {
      return;
    }
    this.stopHeartbeat();
    this.scheduleNextPing();
  }

  /**
   * Stop all heartbeat timers.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatPingTimer !== null) {
      clearTimeout(this.heartbeatPingTimer);
      this.heartbeatPingTimer = null;
    }
    if (this.heartbeatPongTimer !== null) {
      clearTimeout(this.heartbeatPongTimer);
      this.heartbeatPongTimer = null;
    }
  }

  private isBrowser(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.document !== 'undefined' &&
      typeof window.navigator !== 'undefined'
    );
  }

  private shouldAttemptReconnect(code: number): boolean {
    if (!this.reconnectConfig.enabled) {
      return false;
    }
    if (this.reconnectAttempt >= this.reconnectConfig.maxRetries) {
      return false;
    }
    if (code === 1000) {
      return false;
    }
    return true;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }

    this.reconnectAttempt += 1;

    if (this.reconnectAttempt > this.reconnectConfig.maxRetries) {
      return;
    }

    const delay = this.calculateBackoffDelay();
    this._state = 'reconnecting';
    this.onReconnecting?.(this.reconnectAttempt, this.reconnectConfig.maxRetries);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalClose) {
        return;
      }
      this._state = 'connecting';
      this.establishConnection();
    }, delay);
  }

  private isDisconnected(): boolean {
    return (
      this._state === 'disconnected' &&
      !this.intentionalClose &&
      this.reconnectConfig.enabled
    );
  }

  private attachBrowserListeners(): void {
    if (!this.isBrowser()) {
      return;
    }

    if (!this.visibilityHandler && this.reconnectOnVisibilityChange) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && this.isDisconnected()) {
          this.scheduleReconnect();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    if (!this.onlineHandler && this.reconnectOnOnline) {
      this.onlineHandler = () => {
        if (window.navigator.onLine && this.isDisconnected()) {
          this.scheduleReconnect();
        }
      };
      window.addEventListener('online', this.onlineHandler);
    }
  }

  private detachBrowserListeners(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  private calculateBackoffDelay(): number {
    const delay = this.reconnectConfig.initialDelay * Math.pow(2, this.reconnectAttempt - 1);
    return Math.min(delay, this.reconnectConfig.maxDelay);
  }

  send(message: ClientMessage): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
      return;
    }
    if (this.reconnectConfig.enabled && !this.intentionalClose) {
      this.outboundQueue.push(message);
      return;
    }
    throw new ConnectionError('WebSocket is not connected');
  }

  /**
   * Flush queued outbound messages in FIFO order.
   * Stops on first failure (connection closed mid-flush) and leaves remaining queued.
   */
  private flushQueue(): void {
    while (this.outboundQueue.length > 0) {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        break;
      }
      const message = this.outboundQueue.shift();
      if (message !== undefined) {
        try {
          this._ws.send(JSON.stringify(message));
        } catch (_err: unknown) {
          break;
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    this.intentionalClose = true;
    this.detachBrowserListeners();
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.outboundQueue = [];
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
    this.onReconnecting = null;
    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = null;
    }
    this._state = 'disconnected';
    this.reconnectAttempt = 0;
    // Reject any pending connect promise before clearing handlers
    this.connectReject?.(new ConnectionError('Connection disposed'));
    this.pendingConnectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
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

  get state(): WsState {
    return this._state;
  }

  get reconnectAttemptCount(): number {
    return this.reconnectAttempt;
  }

  get queuedMessageCount(): number {
    return this.outboundQueue.length;
  }

  private buildWsUrl(): string {
    const proto = this.config.url.startsWith('https') ? 'wss' : 'ws';
    const clean = this.config.url.replace(/^https?:\/\//, '');
    return `${proto}://${clean}/ws?token=${encodeURIComponent(this.config.token)}`;
  }
}
