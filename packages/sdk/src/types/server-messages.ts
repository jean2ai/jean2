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
  PermissionRequestMessage,
  PermissionGrantedMessage,
  PermissionListMessage,
  PermissionRevokedMessage,
  PermissionAllRevokedMessage,
  PermissionsSyncResponseMessage,
  ToolApprovalRequiredMessage,
  QueueListMessage,
  QueueAddedMessage,
  QueueRemovedMessage,
  QueueSendingMessage,
  SubagentStartedMessage,
  SubagentCompletedMessage,
  SubagentProgressMessage,
  ProviderStatusMessage,
  ProviderConnectedMessage,
  ErrorMessage,
  RateLimitErrorMessage,
  ServerErrorMessage,
  TimeoutErrorMessage,
  AuthErrorMessage,
  InvalidRequestErrorMessage,
  ContextOverflowErrorMessage,
} from '../protocol/server';
import type { TypedEventEmitter } from '../emitter';
import type { SdkEvent } from './sdk-types';

export interface SdkEventMap {
  [key: string]: unknown[];

  'connected': [];
  'disconnected': [payload: { code: number; reason: string; wasClean: boolean }];
  'reconnecting': [payload: { attempt: number; maxRetries: number }];
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

  'permission.request': [
    sessionId: PermissionRequestMessage['sessionId'],
    childSessionId: PermissionRequestMessage['childSessionId'],
    subagentName: PermissionRequestMessage['subagentName'],
    toolCallId: PermissionRequestMessage['toolCallId'],
    toolName: PermissionRequestMessage['toolName'],
    args: PermissionRequestMessage['args'],
    permissionType: PermissionRequestMessage['permissionType'],
    permissionKey: PermissionRequestMessage['permissionKey'],
    message: PermissionRequestMessage['message'],
    details: PermissionRequestMessage['details'],
    dangerous: PermissionRequestMessage['dangerous'],
  ];
  'permission.granted': [
    toolCallId: PermissionGrantedMessage['toolCallId'],
    cached: PermissionGrantedMessage['cached'],
  ];
  'permission.list': [
    workspaceId: PermissionListMessage['workspaceId'],
    permissions: PermissionListMessage['permissions'],
  ];
  'permission.revoked': [permissionId: PermissionRevokedMessage['permissionId']];
  'permission.all_revoked': [
    workspaceId: PermissionAllRevokedMessage['workspaceId'],
    count: PermissionAllRevokedMessage['count'],
  ];
  'permissions.sync': [approvals: PermissionsSyncResponseMessage['approvals']];
  'tool.approval_required': [
    toolCallId: ToolApprovalRequiredMessage['toolCallId'],
    toolName: ToolApprovalRequiredMessage['toolName'],
    args: ToolApprovalRequiredMessage['args'],
    dangerous: ToolApprovalRequiredMessage['dangerous'],
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

  'subagent.started': [
    parentSessionId: SubagentStartedMessage['parentSessionId'],
    childSessionId: SubagentStartedMessage['childSessionId'],
    subagentType: SubagentStartedMessage['subagentType'],
    description: SubagentStartedMessage['description'],
  ];
  'subagent.completed': [
    parentSessionId: SubagentCompletedMessage['parentSessionId'],
    childSessionId: SubagentCompletedMessage['childSessionId'],
    subagentType: SubagentCompletedMessage['subagentType'],
    result: SubagentCompletedMessage['result'],
    error: SubagentCompletedMessage['error'],
  ];
  'subagent.progress': [
    parentSessionId: SubagentProgressMessage['parentSessionId'],
    childSessionId: SubagentProgressMessage['childSessionId'],
    status: SubagentProgressMessage['status'],
    toolName: SubagentProgressMessage['toolName'],
    delta: SubagentProgressMessage['delta'],
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
    case 'permission.request':
      emitter.emit('permission.request',
        msg.sessionId,
        msg.childSessionId,
        msg.subagentName,
        msg.toolCallId,
        msg.toolName,
        msg.args,
        msg.permissionType,
        msg.permissionKey,
        msg.message,
        msg.details,
        msg.dangerous,
      );
      break;
    case 'permission.granted':
      emitter.emit('permission.granted', msg.toolCallId, msg.cached);
      break;
    case 'permission.list':
      emitter.emit('permission.list', msg.workspaceId, msg.permissions);
      break;
    case 'permission.revoked':
      emitter.emit('permission.revoked', msg.permissionId);
      break;
    case 'permission.all_revoked':
      emitter.emit('permission.all_revoked', msg.workspaceId, msg.count);
      break;
    case 'permissions.sync':
      emitter.emit('permissions.sync', msg.approvals);
      break;
    case 'tool.approval_required':
      emitter.emit('tool.approval_required', msg.toolCallId, msg.toolName, msg.args, msg.dangerous);
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
    case 'pong':
      break;
    case 'subagent.started':
      emitter.emit('subagent.started', msg.parentSessionId, msg.childSessionId, msg.subagentType, msg.description);
      break;
    case 'subagent.completed':
      emitter.emit('subagent.completed', msg.parentSessionId, msg.childSessionId, msg.subagentType, msg.result, msg.error);
      break;
    case 'subagent.progress':
      emitter.emit('subagent.progress', msg.parentSessionId, msg.childSessionId, msg.status, msg.toolName, msg.delta);
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
