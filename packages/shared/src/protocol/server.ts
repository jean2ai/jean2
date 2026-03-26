import type { Session } from '../types/session';
import type { Message, Part, MessageWithParts, QueuedMessage } from '../types/message';
import type { PermissionType, ToolPermission } from '../types/permission';
import type { SessionInterruptResult } from '../types/interrupt';

export interface SessionCreatedMessage {
  type: 'session.created';
  session: Session;
}

export interface SessionResumedMessage {
  type: 'session.resumed';
  session: Session;
  messages: MessageWithParts[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isRunning?: boolean;
}

export interface MessageCreatedMessage {
  type: 'message.created';
  message: Message;
}

export interface MessageUpdatedMessage {
  type: 'message.updated';
  message: Message;
}

export interface PartCreatedMessage {
  type: 'part.created';
  sessionId: string;
  part: Part;
}

export interface PartUpdatedMessage {
  type: 'part.updated';
  sessionId: string;
  part: Part;
}

export interface PartAppendMessage {
  type: 'part.append';
  sessionId: string;
  partId: string;
  field: 'text' | 'reasoning';
  delta: string;
}

export interface ToolApprovalRequiredMessage {
  type: 'tool.approval_required';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  dangerous: boolean;
}

// code can be: 'rate_limit' | 'server_error' | 'timeout' | 'authentication' | 'invalid_request' | 'chat_error' | 'parse_error' | 'not_found' | etc.
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface SessionClosedMessage {
  type: 'session.closed';
  sessionId: string;
}

export interface SessionUpdatedMessage {
  type: 'session.updated';
  session: Session;
}

export interface SessionReopenedMessage {
  type: 'session.reopened';
  session: Session;
}

export interface SessionDeletedMessage {
  type: 'session.deleted';
  sessionId: string;
}

export interface SessionRenamedMessage {
  type: 'session.renamed';
  session: Session;
}

export interface ChatUsageMessage {
  type: 'chat.usage';
  sessionId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  variant?: string;
}

export interface PermissionRequestMessage {
  type: 'permission.request';
  sessionId: string;
  childSessionId?: string;
  subagentName?: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
}

export interface PermissionGrantedMessage {
  type: 'permission.granted';
  toolCallId: string;
  cached: boolean;
}

export interface PermissionListMessage {
  type: 'permission.list';
  workspaceId: string;
  permissions: ToolPermission[];
}

export interface PermissionRevokedMessage {
  type: 'permission.revoked';
  permissionId: string;
}

export interface PermissionAllRevokedMessage {
  type: 'permission.all_revoked';
  workspaceId: string;
  count: number;
}

export interface PermissionsSyncResponseMessage {
  type: 'permissions.sync';
  approvals: Array<{
    sessionId: string;
    childSessionId?: string;
    subagentName?: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    permissionType: PermissionType;
    permissionKey: string;
    message: string;
    details?: Record<string, unknown>;
    dangerous?: boolean;
  }>;
}

export interface SubagentStartedMessage {
  type: 'subagent.started';
  parentSessionId: string;
  childSessionId: string;
  subagentType: string;
  description: string;
}

export interface SubagentCompletedMessage {
  type: 'subagent.completed';
  parentSessionId: string;
  childSessionId: string;
  subagentType: string;
  result: string;
  error?: string;
}

export interface SubagentProgressMessage {
  type: 'subagent.progress';
  parentSessionId: string;
  childSessionId: string;
  status: 'thinking' | 'tool_call' | 'tool_result';
  toolName?: string;
  delta?: string;
}

// =============================================================================
// Compaction Messages
// =============================================================================

export interface CompactionCompleteMessage {
  type: 'compaction.complete';
  sessionId: string;
  tokensUsed: {
    prompt: number;
    completion: number;
  };
}

// =============================================================================
// Revert Messages
// =============================================================================

export interface SessionRevertedMessage {
  type: 'session.reverted';
  sessionId: string;
  revertedTo: {
    messageId: string;
    messageCount: number;
  };
  removed: {
    messageIds: string[];
    partCount: number;
  };
}

export interface SessionStateMessage {
  type: 'session.state';
  sessionId: string;
  messages: MessageWithParts[];
}

// =============================================================================
// Fork Messages
// =============================================================================

export interface SessionForkedMessage {
  type: 'session.forked';
  originalSessionId: string;
  forkedSession: Session;
  messages: MessageWithParts[];
}

// =============================================================================
// Interrupt Messages
// =============================================================================

export interface SessionInterruptedMessage {
  type: 'session.interrupted';
  sessionId: string;
  result: SessionInterruptResult;
}

// =============================================================================
// Queue Messages
// =============================================================================

export interface QueueListMessage {
  type: 'queue.list';
  sessionId: string;
  messages: QueuedMessage[];
}

export interface QueueAddedMessage {
  type: 'queue.added';
  sessionId: string;
  message: QueuedMessage;
}

export interface QueueRemovedMessage {
  type: 'queue.removed';
  sessionId: string;
  queueId: string;
}

export interface QueueSendingMessage {
  type: 'queue.sending';
  sessionId: string;
  queueId: string;
}

// =============================================================================
// Error Messages
// =============================================================================

export interface RateLimitErrorMessage {
  type: 'error.rate_limit';
  code: 'rate_limit';
  message: string;
  retryAfterMs: number;
}

export interface ServerErrorMessage {
  type: 'error.server';
  code: 'server_error';
  message: string;
  retryAfterMs?: number;
}

export interface TimeoutErrorMessage {
  type: 'error.timeout';
  code: 'timeout';
  message: string;
  retryAfterMs?: number;
}

export interface AuthErrorMessage {
  type: 'error.auth';
  code: 'authentication';
  message: string;
}

export interface InvalidRequestErrorMessage {
  type: 'error.invalid_request';
  code: 'invalid_request';
  message: string;
}

export interface ContextOverflowErrorMessage {
  type: 'error.context_overflow';
  code: 'context_overflow';
  message: string;
}

export interface ProviderStatusMessage {
  type: 'provider.status';
  provider: string;
  connected: boolean;
  authorizationUrl?: string;
  error?: string;
}

export interface ProviderConnectedMessage {
  type: 'provider.connected';
  provider: string;
  connected: boolean;
  connectedAt?: string;
  accountId?: string;
}

export type ServerMessage =
  | MessageCreatedMessage
  | MessageUpdatedMessage
  | PartCreatedMessage
  | PartUpdatedMessage
  | PartAppendMessage
  | SessionCreatedMessage
  | SessionResumedMessage
  | ChatUsageMessage
  | ErrorMessage
  | SessionClosedMessage
  | SessionUpdatedMessage
  | SessionReopenedMessage
  | SessionDeletedMessage
  | SessionRenamedMessage
  | ToolApprovalRequiredMessage
  | PermissionRequestMessage
  | PermissionGrantedMessage
  | PermissionListMessage
  | PermissionRevokedMessage
  | PermissionAllRevokedMessage
  | PermissionsSyncResponseMessage
  | SubagentStartedMessage
  | SubagentCompletedMessage
  | SubagentProgressMessage
  | CompactionCompleteMessage
  | SessionRevertedMessage
  | SessionStateMessage
  | SessionForkedMessage
  | SessionInterruptedMessage
  | QueueListMessage
  | QueueAddedMessage
  | QueueRemovedMessage
  | QueueSendingMessage
  | RateLimitErrorMessage
  | ServerErrorMessage
  | TimeoutErrorMessage
  | AuthErrorMessage
  | InvalidRequestErrorMessage
  | ContextOverflowErrorMessage
  | ProviderStatusMessage
  | ProviderConnectedMessage;
