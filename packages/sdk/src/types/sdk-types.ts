import type { ServerMessage } from '../shared';

export interface ClientConfig {
  url: string;
  token?: string;
  wsConstructor?: typeof WebSocket;
  apiBase?: string;
  autoSyncPermissions?: boolean;
  connectionTimeout?: number;
  clientDescriptor?: import('../shared-protocol/client').ClientDescriptor;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting';

export type SdkEvent =
  | { source: 'lifecycle'; type: 'connected'; payload: undefined }
  | { source: 'lifecycle'; type: 'disconnected'; payload: { code: number; reason: string; wasClean: boolean } }
  | { source: 'lifecycle'; type: 'error.connection'; payload: Error }
  | { source: 'server'; type: string; raw: ServerMessage };
