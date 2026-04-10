import type { ToolPermission, QueuedMessage, PermissionType } from '@jean2/sdk';
import type { SessionHandlersContext } from './types';

interface PendingPermissionRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey?: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  childSessionId?: string;
  subagentName?: string;
}

export function handlePermissionList(
  msg: { type: 'permission.list'; workspaceId: string; permissions: ToolPermission[] },
  ctx: SessionHandlersContext,
): void {
  const { permissions } = msg;
  const { setPermissions } = ctx;
  setPermissions(permissions);
}

export function handlePermissionsSync(
  msg: { type: 'permissions.sync'; approvals: Array<{ sessionId: string; childSessionId?: string; subagentName?: string; toolCallId: string; toolName: string; args: Record<string, unknown>; permissionType: PermissionType; permissionKey: string; message: string; details?: Record<string, unknown>; dangerous?: boolean }> },
  ctx: SessionHandlersContext,
): void {
  const { approvals } = msg;
  const { mergePendingPermissions } = ctx;

  mergePendingPermissions(
    approvals.map((a) => ({
      toolCallId: a.toolCallId,
      sessionId: a.sessionId,
      toolName: a.toolName,
      args: a.args,
      permissionType: a.permissionType,
      permissionKey: a.permissionKey,
      message: a.message,
      details: a.details,
      dangerous: a.dangerous,
      childSessionId: a.childSessionId,
      subagentName: a.subagentName,
    }))
  );
}

export function handlePermissionRevoked(
  msg: { type: 'permission.revoked'; permissionId: string },
  ctx: SessionHandlersContext,
): void {
  const { permissionId } = msg;
  const { setPermissions } = ctx;

  setPermissions(prev => prev.map(p =>
    p.id === permissionId ? { ...p, revokedAt: new Date().toISOString() } : p
  ));
}

export function handlePermissionAllRevoked(
  msg: { type: 'permission.all_revoked'; workspaceId: string; count: number },
  ctx: SessionHandlersContext,
): void {
  const { setPermissions } = ctx;

  setPermissions(prev => {
    const now = new Date().toISOString();
    return prev.map(p => ({ ...p, revokedAt: now }));
  });
}

export function handlePermissionRequest(
  msg: { type: 'permission.request'; sessionId: string; childSessionId?: string; subagentName?: string; toolCallId: string; toolName: string; args: Record<string, unknown>; permissionType: PermissionType; permissionKey: string; message: string; details?: Record<string, unknown>; dangerous?: boolean },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, toolCallId, toolName, args, permissionType, permissionKey, message, details, dangerous, childSessionId, subagentName } = msg;
  const {
    addPendingPermission,
    sessionsRef,
    notifiedToolCallIdsRef,
    permissionSoundEnabledRef,
    playPermissionSound,
  } = ctx;

  const request: PendingPermissionRequest = {
    toolCallId,
    sessionId,
    toolName,
    args,
    permissionType,
    permissionKey,
    message,
    details,
    dangerous,
    childSessionId,
    subagentName,
  };
  addPendingPermission(request);

  const session = sessionsRef.current.find(s => s.id === sessionId);
  if (session?.parentId === null && permissionSoundEnabledRef.current && !notifiedToolCallIdsRef.current.has(toolCallId)) {
    playPermissionSound();
    notifiedToolCallIdsRef.current.add(toolCallId);
  }
}

export function handlePermissionGranted(
  msg: { type: 'permission.granted'; toolCallId: string; cached: boolean },
  ctx: SessionHandlersContext,
): void {
  const { toolCallId } = msg;
  const { removePendingPermissionByToolCallId } = ctx;
  removePendingPermissionByToolCallId(toolCallId);
}

export function handleQueueList(
  msg: { type: 'queue.list'; sessionId: string; messages: QueuedMessage[] },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, messages } = msg;
  const { setQueuedMessagesForSession } = ctx;
  setQueuedMessagesForSession(sessionId, messages);
}

export function handleQueueAdded(
  msg: { type: 'queue.added'; sessionId: string; message: QueuedMessage },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, message } = msg;
  const { addQueuedMessage } = ctx;
  addQueuedMessage(sessionId, message);
}

export function handleQueueRemoved(
  msg: { type: 'queue.removed'; sessionId: string; queueId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, queueId } = msg;
  const { removeQueuedMessageById } = ctx;
  removeQueuedMessageById(sessionId, queueId);
}

export function handleQueueSending(
  msg: { type: 'queue.sending'; sessionId: string; queueId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, queueId } = msg;
  const { removeQueuedMessageById } = ctx;
  removeQueuedMessageById(sessionId, queueId);
}

export const permissionQueueHandlers = {
  'permission.list': handlePermissionList,
  'permissions.sync': handlePermissionsSync,
  'permission.revoked': handlePermissionRevoked,
  'permission.all_revoked': handlePermissionAllRevoked,
  'permission.request': handlePermissionRequest,
  'permission.granted': handlePermissionGranted,
  'queue.list': handleQueueList,
  'queue.added': handleQueueAdded,
  'queue.removed': handleQueueRemoved,
  'queue.sending': handleQueueSending,
} as const;
