import type { Session } from '../types/session';
import type { Message, ToolCallBlock } from '../types/message';
import type { PermissionType, ToolPermission } from '../types/permission';

export interface SessionCreatedMessage {
  type: 'session.created';
  session: Session;
}

export interface SessionResumedMessage {
  type: 'session.resumed';
  session: Session;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatStartMessage {
  type: 'chat.start';
  sessionId: string;
  messageId: string;
}

export interface ChatDeltaMessage {
  type: 'chat.delta';
  sessionId: string;
  messageId: string;
  delta: string;
}

export interface ChatToolCallMessage {
  type: 'chat.tool_call';
  sessionId: string;
  messageId: string;
  toolCall: ToolCallBlock;
}

export interface ChatToolResultMessage {
  type: 'chat.tool_result';
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ToolApprovalRequiredMessage {
  type: 'tool.approval_required';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  dangerous: boolean;
}

export interface ChatCompleteMessage {
  type: 'chat.complete';
  sessionId: string;
  message: Message;
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

export interface ChatUserMessageMessage {
  type: 'chat.user_message';
  sessionId: string;
  message: Message;
}

export interface PermissionRequestMessage {
  type: 'permission.request';
  sessionId: string;
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

export type ServerMessage =
  | SessionCreatedMessage
  | SessionResumedMessage
  | ChatStartMessage
  | ChatDeltaMessage
  | ChatToolCallMessage
  | ChatToolResultMessage
  | ToolApprovalRequiredMessage
  | ChatCompleteMessage
  | ErrorMessage
  | SessionClosedMessage
  | SessionUpdatedMessage
  | SessionReopenedMessage
  | SessionDeletedMessage
  | SessionRenamedMessage
  | ChatUsageMessage
  | ChatUserMessageMessage
  | PermissionRequestMessage
  | PermissionGrantedMessage
  | PermissionListMessage
  | PermissionRevokedMessage
  | PermissionAllRevokedMessage
  | SubagentStartedMessage
  | SubagentCompletedMessage
  | SubagentProgressMessage;
