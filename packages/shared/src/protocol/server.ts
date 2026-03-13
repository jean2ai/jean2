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
  compactedCount: number;
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
    stepNumber: number;
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
  | SubagentStartedMessage
  | SubagentCompletedMessage
  | SubagentProgressMessage
  | CompactionCompleteMessage
  | SessionRevertedMessage
  | SessionStateMessage
  | SessionInterruptedMessage
  | QueueListMessage
  | QueueAddedMessage
  | QueueRemovedMessage
  | QueueSendingMessage;
