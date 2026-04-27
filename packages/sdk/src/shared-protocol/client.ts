export interface SessionCreateMessage {
  type: 'session.create';
  workspaceId?: string;
  preconfigId?: string;
  title?: string;
}

export interface SessionResumeMessage {
  type: 'session.resume';
  sessionId: string;
}

import type { AttachmentKind } from '../shared-types/model';

export interface ChatMessageAttachment {
  id: string;
  kind: AttachmentKind;
}

export interface ChatMessage {
  type: 'chat.message';
  sessionId: string;
  content: string;
  attachments?: ChatMessageAttachment[];
}

export interface SessionCloseMessage {
  type: 'session.close';
  sessionId: string;
}

export interface SessionUpdateMessage {
  type: 'session.update';
  sessionId: string;
  preconfigId?: string;
}

export interface SessionUpdateModelMessage {
  type: 'session.update_model';
  sessionId: string;
  modelId: string;
  providerId: string;
  variant?: string;
}

export interface SessionReopenMessage {
  type: 'session.reopen';
  sessionId: string;
}

export interface SessionDeleteMessage {
  type: 'session.delete';
  sessionId: string;
}

export interface SessionRenameMessage {
  type: 'session.rename';
  sessionId: string;
  title: string;
}

export interface PermissionResponseMessage {
  type: 'permission.response';
  toolCallId: string;
  allowed: boolean;
  alwaysAllow: boolean;
}

export interface PermissionListRequestMessage {
  type: 'permission.list';
  workspaceId: string;
  includeRevoked?: boolean;
}

export interface PermissionRevokeMessage {
  type: 'permission.revoke';
  permissionId: string;
}

export interface PermissionRevokeAllMessage {
  type: 'permission.revoke_all';
  workspaceId: string;
}

export interface PermissionsSyncMessage {
  type: 'permissions.sync';
}

// =============================================================================
// Compaction Messages
// =============================================================================

export interface SessionCompactMessage {
  type: 'session.compact';
  sessionId: string;
}

// =============================================================================
// Revert Messages
// =============================================================================

export interface SessionRevertMessage {
  type: 'session.revert';
  sessionId: string;
  messageId: string;
}

// =============================================================================
// Fork Messages
// =============================================================================

export interface SessionForkMessage {
  type: 'session.fork';
  sessionId: string;
  messageId: string;
  title?: string;
}

// =============================================================================
// Interrupt Messages
// =============================================================================

export interface SessionInterruptMessage {
  type: 'session.interrupt';
  sessionId: string;
  reason?: 'user_request' | 'timeout' | 'error';
}

// =============================================================================
// Queue Messages
// =============================================================================

export interface QueueAddMessage {
  type: 'queue.add';
  sessionId: string;
  content: string;
  attachments?: ChatMessageAttachment[];
}

export interface QueueRemoveMessage {
  type: 'queue.remove';
  queueId: string;
}

export interface ProviderConnectMessage {
  type: 'provider.connect';
  provider: string;
}

export interface ProviderDisconnectMessage {
  type: 'provider.disconnect';
  provider: string;
}

// =============================================================================
// Ask User Messages (Client → Server)
// =============================================================================

export interface AskUserResponseMessage {
  type: 'ask_user.response';
  toolCallId: string;
  response: unknown;
}

// =============================================================================
// Heartbeat Messages
// =============================================================================

export interface PongMessage {
  type: 'pong';
}

export type ClientMessage = 
  | SessionCreateMessage 
  | SessionResumeMessage
  | ChatMessage
  | SessionCloseMessage
  | SessionUpdateMessage
  | SessionUpdateModelMessage
  | SessionReopenMessage
  | SessionDeleteMessage
  | SessionRenameMessage
  | PermissionResponseMessage
  | PermissionListRequestMessage
  | PermissionRevokeMessage
  | PermissionRevokeAllMessage
  | PermissionsSyncMessage
  | SessionCompactMessage
  | SessionRevertMessage
  | SessionForkMessage
  | SessionInterruptMessage
  | QueueAddMessage
  | QueueRemoveMessage
  | ProviderConnectMessage
  | ProviderDisconnectMessage
  | AskUserResponseMessage
  | PongMessage;
