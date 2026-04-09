import type { ServerMessage } from '../protocol/server';

export interface HeartbeatOptions {
  /** Enable heartbeat. Defaults to true. */
  enabled?: boolean;
  /** Interval in ms between ping messages. Defaults to 30000 (30s). */
  interval?: number;
  /** Timeout in ms to wait for pong response. Defaults to 5000 (5s). */
  timeout?: number;
}

export interface ReconnectOptions {
  enabled?: boolean;
  initialDelay?: number;
  maxDelay?: number;
  maxRetries?: number;
  reconnectOnVisibilityChange?: boolean;
  reconnectOnOnline?: boolean;
}

export interface ClientConfig {
  url: string;
  token: string;
  wsConstructor?: typeof WebSocket;
  apiBase?: string;
  autoSyncPermissions?: boolean;
  connectionTimeout?: number;
  reconnect?: ReconnectOptions;
  heartbeat?: HeartbeatOptions;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting';

export type SdkEvent =
  | { source: 'lifecycle'; type: 'connected'; payload: undefined }
  | { source: 'lifecycle'; type: 'disconnected'; payload: { code: number; reason: string; wasClean: boolean } }
  | { source: 'lifecycle'; type: 'reconnecting'; payload: { attempt: number; maxRetries: number } }
  | { source: 'lifecycle'; type: 'error.connection'; payload: Error }
  | { source: 'server'; type: string; raw: ServerMessage };
