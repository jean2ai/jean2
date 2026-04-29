import type { Session } from '../shared-types/session';
import type { Message, Part, MessageWithParts, QueuedMessage } from '../shared-types/message';
import type { PermissionGrant } from '../shared-types/permission';
import type { SessionInterruptResult } from '../shared-types/interrupt';
import type { Ask } from '../shared-types/tool';

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

// Permission grant management (persisted grants only)
export interface PermissionListMessage {
  type: 'permission.list';
  workspaceId: string;
  grants: PermissionGrant[];
}

export interface PermissionGrantedMessage {
  type: 'permission.granted';
  grant: PermissionGrant;
}

export interface PermissionRevokedMessage {
  type: 'permission.revoked';
  grantId: string;
}

export interface PermissionAllRevokedMessage {
  type: 'permission.all_revoked';
  workspaceId: string;
  count: number;
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
    messageId: string | null;
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

// =============================================================================
// Ask Messages (Server → Client)
// =============================================================================

// Note: The 'ask.request' message is the ONLY interactive protocol.
// All permission asks are routed through this protocol.
export interface AskRequestMessage {
  type: 'ask.request';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  ask: Ask;
}

export interface AskTimedOutMessage {
  type: 'ask.timeout';
  sessionId: string;
  toolCallId: string;
}

// =============================================================================
// Heartbeat Messages
// =============================================================================

export interface PingMessage {
  type: 'ping';
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
  | PermissionListMessage
  | PermissionGrantedMessage
  | PermissionRevokedMessage
  | PermissionAllRevokedMessage
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
  | ProviderConnectedMessage
  | AskRequestMessage
  | AskTimedOutMessage
  | PingMessage;