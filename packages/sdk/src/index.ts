export { Jean2Client } from './client';
export { TypedEventEmitter } from './emitter';
export type { EventMap } from './emitter';

export {
  Jean2Error,
  ConnectionError,
  AuthError,
  RateLimitError,
  TimeoutError,
  ServerError,
  ValidationError,
} from './errors';

export { version } from './version';

export type { SdkEventMap } from './types/server-messages';
export { routeServerMessage } from './types/server-messages';

export { WebSocketTransport } from './transport/websocket';
export type { WebSocketTransportConfig, WsState } from './transport/websocket';

export { HttpClient } from './transport/http';
export type { HttpClientConfig } from './transport/http';

export { SessionsNamespace } from './namespaces/sessions';
export { ChatNamespace } from './namespaces/chat';
export { PermissionsNamespace } from './namespaces/permissions';
export { QueueNamespace } from './namespaces/queue';
export { ProvidersNamespace } from './namespaces/providers';

export type { ClientConfig, ConnectionState, SdkEvent } from './types';
