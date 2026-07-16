import type { Session } from '../shared-types/session';
import type { Message, Part, MessageWithParts, QueuedMessage } from '../shared-types/message';
import type { PermissionGrant } from '../shared-types/permission';
import type { SessionInterruptResult } from '../shared-types/interrupt';
import type { Ask } from '../shared-types/tool';
import type { ClientDescriptor } from './client';
import type { SessionControlState, AskAuthority } from '../shared-types/control';

// =============================================================================
// Client Control: Registration Response (Server → Client)
// =============================================================================

export interface ClientRegisteredMessage {
  type: 'client.registered';
  client: ClientDescriptor;
  connectionId: string;
  serverTime: number;
}

export interface ClientRejectedMessage {
  type: 'client.rejected';
  code: 'invalid_client' | 'missing_registration' | 'unsupported_capability';
  message: string;
}

export interface SessionCreatedMessage {
  type: 'session.created';
  session: Session;
}

export interface SessionResumedMessage {
  type: 'session.resumed';
  session: Session;
  messages: MessageWithParts[];
  transcript?: {
    messages: MessageWithParts[];
    pagination: {
      hasOlder: boolean;
      oldestSequence: number | null;
      newestSequence: number | null;
      limit: number;
    };
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isRunning?: boolean;
  control?: SessionControlState;
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
  sessionId?: string;
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
// Session Control Messages (Server → Client)
// =============================================================================

export type SessionControlUpdateReason =
  | 'auto_claimed'
  | 'claimed'
  | 'released'
  | 'takeover_requested'
  | 'takeover_approved'
  | 'takeover_auto_approved'
  | 'takeover_denied'
  | 'grace_entered'
  | 'grace_reattached'
  | 'grace_expired'
  | 'expired'
  | 'reattached';

export interface SessionControlUpdatedMessage {
  type: 'session.control.updated';
  control: SessionControlState;
  reason: SessionControlUpdateReason;
}

export type ControllerGatedAction =
  | 'chat.message'
  | 'session.interrupt'
  | 'session.update'
  | 'session.update_model'
  | 'queue.add'
  | 'queue.remove'
  | 'ask.response';

export interface SessionActionRejectedMessage {
  type: 'session.action_rejected';
  sessionId: string;
  action: ControllerGatedAction | string;
  code: 'not_controller' | 'session_uncontrolled' | 'registration_required';
  message: string;
  control: SessionControlState;
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
  sessionId?: string;
}

export interface ServerErrorMessage {
  type: 'error.server';
  code: 'server_error';
  message: string;
  retryAfterMs?: number;
  sessionId?: string;
}

export interface TimeoutErrorMessage {
  type: 'error.timeout';
  code: 'timeout';
  message: string;
  retryAfterMs?: number;
  sessionId?: string;
}

export interface AuthErrorMessage {
  type: 'error.auth';
  code: 'authentication';
  message: string;
  sessionId?: string;
}

export interface InvalidRequestErrorMessage {
  type: 'error.invalid_request';
  code: 'invalid_request';
  message: string;
  sessionId?: string;
}

export interface ContextOverflowErrorMessage {
  type: 'error.context_overflow';
  code: 'context_overflow';
  message: string;
  sessionId?: string;
}

export interface ProviderStatusMessage {
  type: 'provider.status';
  provider: string;
  connected: boolean;
  authorizationUrl?: string;
  flowId?: string;
  redirectStrategy?: string;
  redirectUri?: string;
  error?: string;
  reauthRequired?: boolean;
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
  /** Canonical request identity for permission asks. Used to correlate responses. */
  requestId?: string;
  /** Authority metadata defining who can see and respond to this ask. */
  authority?: AskAuthority;
}

export interface AskTimedOutMessage {
  type: 'ask.timeout';
  sessionId: string;
  toolCallId: string;
  /** Canonical request identity for the timed-out permission ask. */
  requestId?: string;
}

export interface AskResponseRejectedMessage {
  type: 'ask.response_rejected';
  sessionId: string;
  toolCallId: string;
  requestId?: string;
  code: 'not_controller' | 'not_allowed' | 'ask_not_found' | 'ask_already_resolved';
  message: string;
}

export interface AskPendingSyncMessage {
  type: 'ask.pending_sync';
  /** The root session this sync is scoped to */
  sessionId: string;
  /** Authoritative set of pending permission asks from the server */
  requests: Array<{
    sessionId: string;
    toolCallId: string;
    toolName: string;
    ask: Ask;
    requestId?: string;
    _originSessionId?: string;
    authority?: AskAuthority;
  }>;
}

// =============================================================================
// Heartbeat Messages
// =============================================================================

export interface PingMessage {
  type: 'ping';
}

export type ServerMessage =
  | ClientRegisteredMessage
  | ClientRejectedMessage
  | MessageCreatedMessage
  | MessageUpdatedMessage
  | PartCreatedMessage
  | PartUpdatedMessage
  | PartAppendMessage
  | SessionCreatedMessage
  | SessionResumedMessage
  | SessionControlUpdatedMessage
  | SessionActionRejectedMessage
  | ChatUsageMessage
  | ErrorMessage
  | SessionClosedMessage
  | SessionUpdatedMessage
  | SessionReopenedMessage
  | SessionDeletedMessage
  | SessionRenamedMessage
  | PermissionListMessage
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
  | AskResponseRejectedMessage
  | AskPendingSyncMessage
  | PingMessage;