import type {
  Session,
  Message,
  PartField,
  QueuedMessage,
  ToolPermission,
  PermissionType,
  PermissionKey,
} from '@jean2/shared';

export interface SessionManagerOptions {
  maxSessions?: number;
}

export interface MessageStoreOptions {
  maxSessions?: number;
}

export type PermissionTrackerOptions = Record<string, never>;

export interface SessionManagerEventMap {
  [key: string]: unknown[];
  'session:created': [session: Session];
  'session:updated': [session: Session];
  'session:removed': [sessionId: string];
  'session:active': [session: Session | null];
}

export interface MessageStoreEventMap {
  [key: string]: unknown[];
  'message:created': [message: Message, sessionId: string];
  'message:updated': [message: Message, sessionId: string];
  'message:appended': [sessionId: string, partId: string, field: PartField, delta: string];
  'session:cleared': [sessionId: string];
}

export interface PermissionTrackerEventMap {
  [key: string]: unknown[];
  'permission:pending': [request: PendingPermissionRequest];
  'permission:resolved': [toolCallId: string, cached: boolean];
  'permission:list.updated': [workspaceId: string, permissions: ToolPermission[]];
  'queue:updated': [sessionId: string, messages: QueuedMessage[]];
}

export interface PendingPermissionRequest {
  sessionId: string;
  childSessionId?: string;
  subagentName?: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: PermissionKey;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
}
