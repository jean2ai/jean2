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

export type { ClientConfig, ConnectionState, SdkEvent } from './types';
