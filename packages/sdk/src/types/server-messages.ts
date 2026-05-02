import type {
  ServerMessage,
  SessionCreatedMessage,
  SessionResumedMessage,
  MessageCreatedMessage,
  MessageUpdatedMessage,
  PartCreatedMessage,
  PartUpdatedMessage,
  PartAppendMessage,
  SessionClosedMessage,
  SessionUpdatedMessage,
  SessionReopenedMessage,
  SessionDeletedMessage,
  SessionRenamedMessage,
  SessionInterruptedMessage,
  SessionRevertedMessage,
  SessionForkedMessage,
  SessionStateMessage,
  ChatUsageMessage,
  CompactionCompleteMessage,
  PermissionListMessage,
  PermissionRevokedMessage,
  PermissionAllRevokedMessage,
  QueueListMessage,
  QueueAddedMessage,
  QueueRemovedMessage,
  QueueSendingMessage,
  ProviderStatusMessage,
  ProviderConnectedMessage,
  AskRequestMessage,
  AskTimedOutMessage,
  AskPendingSyncMessage,
  ErrorMessage,
  RateLimitErrorMessage,
  ServerErrorMessage,
  TimeoutErrorMessage,
  AuthErrorMessage,
  InvalidRequestErrorMessage,
  ContextOverflowErrorMessage,
} from '../shared';
import type { TypedEventEmitter } from '../emitter';
import type { SdkEvent } from './sdk-types';

export interface SdkEventMap {
  [key: string]: unknown[];

  'connected': [];
  'disconnected': [payload: { code: number; reason: string; wasClean: boolean }];
  'error.connection': [error: Error];

  'session.created': [session: SessionCreatedMessage['session']];
  'session.resumed': [
    session: SessionResumedMessage['session'],
    messages: SessionResumedMessage['messages'],
    usage: SessionResumedMessage['usage'],
    isRunning: SessionResumedMessage['isRunning'],
  ];
  'session.closed': [sessionId: SessionClosedMessage['sessionId']];
  'session.reopened': [session: SessionReopenedMessage['session']];
  'session.deleted': [sessionId: SessionDeletedMessage['sessionId']];
  'session.updated': [session: SessionUpdatedMessage['session']];
  'session.renamed': [session: SessionRenamedMessage['session']];
  'session.interrupted': [
    sessionId: SessionInterruptedMessage['sessionId'],
    result: SessionInterruptedMessage['result'],
  ];
  'session.reverted': [
    sessionId: SessionRevertedMessage['sessionId'],
    revertedTo: SessionRevertedMessage['revertedTo'],
    removed: SessionRevertedMessage['removed'],
  ];
  'session.forked': [
    originalSessionId: SessionForkedMessage['originalSessionId'],
    forkedSession: SessionForkedMessage['forkedSession'],
    messages: SessionForkedMessage['messages'],
  ];
  'session.state': [
    sessionId: SessionStateMessage['sessionId'],
    messages: SessionStateMessage['messages'],
  ];

  'message.created': [message: MessageCreatedMessage['message']];
  'message.updated': [message: MessageUpdatedMessage['message']];
  'part.created': [sessionId: PartCreatedMessage['sessionId'], part: PartCreatedMessage['part']];
  'part.updated': [sessionId: PartUpdatedMessage['sessionId'], part: PartUpdatedMessage['part']];
  'part.append': [
    sessionId: PartAppendMessage['sessionId'],
    partId: PartAppendMessage['partId'],
    field: PartAppendMessage['field'],
    delta: PartAppendMessage['delta'],
  ];

  'chat.usage': [
    sessionId: ChatUsageMessage['sessionId'],
    usage: ChatUsageMessage['usage'],
    model: ChatUsageMessage['model'],
    variant: ChatUsageMessage['variant'],
  ];
  'compaction.complete': [
    sessionId: CompactionCompleteMessage['sessionId'],
    tokensUsed: CompactionCompleteMessage['tokensUsed'],
  ];

  // Permission grant management events
  'permission.list': [
    workspaceId: PermissionListMessage['workspaceId'],
    grants: PermissionListMessage['grants'],
  ];
  'permission.revoked': [grantId: PermissionRevokedMessage['grantId']];
  'permission.all_revoked': [
    workspaceId: PermissionAllRevokedMessage['workspaceId'],
    count: PermissionAllRevokedMessage['count'],
  ];

  'queue.list': [sessionId: QueueListMessage['sessionId'], messages: QueueListMessage['messages']];
  'queue.added': [sessionId: QueueAddedMessage['sessionId'], message: QueueAddedMessage['message']];
  'queue.removed': [sessionId: QueueRemovedMessage['sessionId'], queueId: QueueRemovedMessage['queueId']];
  'queue.sending': [sessionId: QueueSendingMessage['sessionId'], queueId: QueueSendingMessage['queueId']];

  'provider.status': [
    provider: ProviderStatusMessage['provider'],
    connected: ProviderStatusMessage['connected'],
    authorizationUrl: ProviderStatusMessage['authorizationUrl'],
    error: ProviderStatusMessage['error'],
  ];
  'provider.connected': [
    provider: ProviderConnectedMessage['provider'],
    connected: ProviderConnectedMessage['connected'],
    connectedAt: ProviderConnectedMessage['connectedAt'],
    accountId: ProviderConnectedMessage['accountId'],
  ];

  'ask.request': [
    sessionId: AskRequestMessage['sessionId'],
    toolCallId: AskRequestMessage['toolCallId'],
    toolName: AskRequestMessage['toolName'],
    ask: AskRequestMessage['ask'],
    requestId: AskRequestMessage['requestId'],
  ];
  'ask.timeout': [
    sessionId: AskTimedOutMessage['sessionId'],
    toolCallId: AskTimedOutMessage['toolCallId'],
    requestId: AskTimedOutMessage['requestId'],
  ];
  'ask.pending_sync': [
    sessionId: AskPendingSyncMessage['sessionId'],
    requests: AskPendingSyncMessage['requests'],
  ];

  'error': [code: ErrorMessage['code'], message: ErrorMessage['message']];
  'error.rate_limit': [
    code: RateLimitErrorMessage['code'],
    message: RateLimitErrorMessage['message'],
    retryAfterMs: RateLimitErrorMessage['retryAfterMs'],
  ];
  'error.server': [
    code: ServerErrorMessage['code'],
    message: ServerErrorMessage['message'],
    retryAfterMs: ServerErrorMessage['retryAfterMs'],
  ];
  'error.timeout': [
    code: TimeoutErrorMessage['code'],
    message: TimeoutErrorMessage['message'],
    retryAfterMs: TimeoutErrorMessage['retryAfterMs'],
  ];
  'error.auth': [code: AuthErrorMessage['code'], message: AuthErrorMessage['message']];
  'error.invalid_request': [
    code: InvalidRequestErrorMessage['code'],
    message: InvalidRequestErrorMessage['message'],
  ];
  'error.context_overflow': [
    code: ContextOverflowErrorMessage['code'],
    message: ContextOverflowErrorMessage['message'],
  ];

  '*': [event: SdkEvent];
}

export function routeServerMessage(
  emitter: TypedEventEmitter<SdkEventMap>,
  msg: ServerMessage,
): void {
  switch (msg.type) {
    case 'session.created':
      emitter.emit('session.created', msg.session);
      break;
    case 'session.resumed':
      emitter.emit('session.resumed', msg.session, msg.messages, msg.usage, msg.isRunning);
      break;
    case 'session.closed':
      emitter.emit('session.closed', msg.sessionId);
      break;
    case 'session.reopened':
      emitter.emit('session.reopened', msg.session);
      break;
    case 'session.deleted':
      emitter.emit('session.deleted', msg.sessionId);
      break;
    case 'session.updated':
      emitter.emit('session.updated', msg.session);
      break;
    case 'session.renamed':
      emitter.emit('session.renamed', msg.session);
      break;
    case 'session.interrupted':
      emitter.emit('session.interrupted', msg.sessionId, msg.result);
      break;
    case 'session.reverted':
      emitter.emit('session.reverted', msg.sessionId, msg.revertedTo, msg.removed);
      break;
    case 'session.forked':
      emitter.emit('session.forked', msg.originalSessionId, msg.forkedSession, msg.messages);
      break;
    case 'session.state':
      emitter.emit('session.state', msg.sessionId, msg.messages);
      break;
    case 'message.created':
      emitter.emit('message.created', msg.message);
      break;
    case 'message.updated':
      emitter.emit('message.updated', msg.message);
      break;
    case 'part.created':
      emitter.emit('part.created', msg.sessionId, msg.part);
      break;
    case 'part.updated':
      emitter.emit('part.updated', msg.sessionId, msg.part);
      break;
    case 'part.append':
      emitter.emit('part.append', msg.sessionId, msg.partId, msg.field, msg.delta);
      break;
    case 'chat.usage':
      emitter.emit('chat.usage', msg.sessionId, msg.usage, msg.model, msg.variant);
      break;
    case 'compaction.complete':
      emitter.emit('compaction.complete', msg.sessionId, msg.tokensUsed);
      break;
    case 'permission.list':
      emitter.emit('permission.list', msg.workspaceId, msg.grants);
      break;
    case 'permission.revoked':
      emitter.emit('permission.revoked', msg.grantId);
      break;
    case 'permission.all_revoked':
      emitter.emit('permission.all_revoked', msg.workspaceId, msg.count);
      break;
    case 'queue.list':
      emitter.emit('queue.list', msg.sessionId, msg.messages);
      break;
    case 'queue.added':
      emitter.emit('queue.added', msg.sessionId, msg.message);
      break;
    case 'queue.removed':
      emitter.emit('queue.removed', msg.sessionId, msg.queueId);
      break;
    case 'queue.sending':
      emitter.emit('queue.sending', msg.sessionId, msg.queueId);
      break;
    case 'provider.status':
      emitter.emit('provider.status', msg.provider, msg.connected, msg.authorizationUrl, msg.error);
      break;
    case 'provider.connected':
      emitter.emit('provider.connected', msg.provider, msg.connected, msg.connectedAt, msg.accountId);
      break;
    case 'ask.request':
      emitter.emit('ask.request', msg.sessionId, msg.toolCallId, msg.toolName, msg.ask, msg.requestId);
      break;
    case 'ask.timeout':
      emitter.emit('ask.timeout', msg.sessionId, msg.toolCallId, msg.requestId);
      break;
    case 'ask.pending_sync':
      emitter.emit('ask.pending_sync', msg.sessionId, msg.requests);
      break;
    case 'error':
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.rate_limit':
      emitter.emit('error.rate_limit', msg.code, msg.message, msg.retryAfterMs);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.server':
      emitter.emit('error.server', msg.code, msg.message, msg.retryAfterMs);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.timeout':
      emitter.emit('error.timeout', msg.code, msg.message, msg.retryAfterMs);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.auth':
      emitter.emit('error.auth', msg.code, msg.message);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.invalid_request':
      emitter.emit('error.invalid_request', msg.code, msg.message);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'error.context_overflow':
      emitter.emit('error.context_overflow', msg.code, msg.message);
      emitter.emit('error', msg.code, msg.message);
      break;
    case 'ping':
      // Handled at transport level — no event emission
      return;
    default: {
      const _exhaustive: never = msg;
      console.warn(`Unknown server message type: ${(_exhaustive as { type: string }).type}`);
      break;
    }
  }

  emitter.emit('*', {
    source: 'server',
    type: (msg as { type: string }).type,
    raw: msg,
  });
}
