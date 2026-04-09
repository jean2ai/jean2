import type { PermissionType, PermissionKey, QueuedMessage, ToolPermission } from '@jean2/shared';
import type {
  PendingPermissionRequest,
  PermissionTrackerEventMap,
} from '../types/state-types';
import type { SdkEventMap } from '../types/server-messages';
import type { Jean2Client } from '../client';
import { TypedEventEmitter } from '../emitter';

export class PermissionTracker extends TypedEventEmitter<PermissionTrackerEventMap> {
  private pendingRequests = new Map<string, PendingPermissionRequest>();
  private grantedPermissions = new Map<string, ToolPermission[]>();
  private permissionIndex = new Map<string, string>();
  private queues = new Map<string, QueuedMessage[]>();
  private subscriptions: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  private _disposed = false;
  private client: Jean2Client;

  constructor(client: Jean2Client) {
    super();
    this.client = client;
    this.subscribe();
  }

  private subscribe(): void {
    const onPermissionsSync = (approvals: SdkEventMap['permissions.sync'][0]) => {
      this.pendingRequests.clear();
      for (const approval of approvals) {
        const request: PendingPermissionRequest = {
          sessionId: approval.sessionId,
          childSessionId: approval.childSessionId,
          subagentName: approval.subagentName,
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          args: approval.args,
          permissionType: approval.permissionType,
          permissionKey: approval.permissionKey,
          message: approval.message,
          details: approval.details,
          dangerous: approval.dangerous,
        };
        this.pendingRequests.set(approval.toolCallId, request);
        this.emit('permission:pending', request);
      }
    };
    this.client.on('permissions.sync', onPermissionsSync as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permissions.sync', handler: onPermissionsSync as unknown as (...args: unknown[]) => void });

    const onPermissionRequest = (
      sessionId: string,
      childSessionId: string | undefined,
      subagentName: string | undefined,
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
      permissionType: PermissionType,
      permissionKey: PermissionKey,
      message: string,
      details: Record<string, unknown> | undefined,
      dangerous: boolean | undefined,
    ) => {
      const request: PendingPermissionRequest = {
        sessionId,
        childSessionId,
        subagentName,
        toolCallId,
        toolName,
        args,
        permissionType,
        permissionKey,
        message,
        details,
        dangerous,
      };
      this.pendingRequests.set(toolCallId, request);
      this.emit('permission:pending', request);
    };
    this.client.on('permission.request', onPermissionRequest as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permission.request', handler: onPermissionRequest as unknown as (...args: unknown[]) => void });

    const onPermissionGranted = (toolCallId: string, cached: boolean) => {
      this.pendingRequests.delete(toolCallId);
      this.emit('permission:resolved', toolCallId, cached);
    };
    this.client.on('permission.granted', onPermissionGranted as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permission.granted', handler: onPermissionGranted as unknown as (...args: unknown[]) => void });

    const onPermissionList = (workspaceId: string, permissions: ToolPermission[]) => {
      this.grantedPermissions.set(workspaceId, permissions);
      for (const permission of permissions) {
        this.permissionIndex.set(permission.id, workspaceId);
      }
      this.emit('permission:list.updated', workspaceId, permissions);
    };
    this.client.on('permission.list', onPermissionList as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permission.list', handler: onPermissionList as unknown as (...args: unknown[]) => void });

    const onPermissionRevoked = (permissionId: string) => {
      const workspaceId = this.permissionIndex.get(permissionId);
      if (workspaceId) {
        const permissions = this.grantedPermissions.get(workspaceId) ?? [];
        const updated = permissions.filter((p) => p.id !== permissionId);
        this.grantedPermissions.set(workspaceId, updated);
        this.permissionIndex.delete(permissionId);
        this.emit('permission:list.updated', workspaceId, updated);
      }
    };
    this.client.on('permission.revoked', onPermissionRevoked as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permission.revoked', handler: onPermissionRevoked as unknown as (...args: unknown[]) => void });

    const onPermissionAllRevoked = (workspaceId: string, _count: number) => {
      this.grantedPermissions.set(workspaceId, []);
      this.emit('permission:list.updated', workspaceId, []);
    };
    this.client.on('permission.all_revoked', onPermissionAllRevoked as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'permission.all_revoked', handler: onPermissionAllRevoked as unknown as (...args: unknown[]) => void });

    const onQueueList = (sessionId: string, messages: QueuedMessage[]) => {
      this.queues.set(sessionId, messages);
      this.emit('queue:updated', sessionId, messages);
    };
    this.client.on('queue.list', onQueueList as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'queue.list', handler: onQueueList as unknown as (...args: unknown[]) => void });

    const onQueueAdded = (sessionId: string, message: QueuedMessage) => {
      const queue = this.queues.get(sessionId) ?? [];
      queue.push(message);
      this.queues.set(sessionId, queue);
      this.emit('queue:updated', sessionId, queue);
    };
    this.client.on('queue.added', onQueueAdded as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'queue.added', handler: onQueueAdded as unknown as (...args: unknown[]) => void });

    const onQueueRemoved = (sessionId: string, queueId: string) => {
      const queue = this.queues.get(sessionId) ?? [];
      const updated = queue.filter((m) => m.id !== queueId);
      this.queues.set(sessionId, updated);
      this.emit('queue:updated', sessionId, updated);
    };
    this.client.on('queue.removed', onQueueRemoved as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'queue.removed', handler: onQueueRemoved as unknown as (...args: unknown[]) => void });

    const onQueueSending = (sessionId: string, queueId: string) => {
      const queue = (this.queues.get(sessionId) ?? []).filter(m => m.id !== queueId);
      this.queues.set(sessionId, queue);
      this.emit('queue:updated', sessionId, queue);
    };
    this.client.on('queue.sending', onQueueSending as Parameters<Jean2Client['on']>[1]);
    this.subscriptions.push({ event: 'queue.sending', handler: onQueueSending as unknown as (...args: unknown[]) => void });
  }

  getPendingRequests(): PendingPermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  getPendingRequest(toolCallId: string): PendingPermissionRequest | undefined {
    return this.pendingRequests.get(toolCallId);
  }

  hasPending(): boolean {
    return this.pendingRequests.size > 0;
  }

  getPermissions(workspaceId: string): ToolPermission[] {
    return this.grantedPermissions.get(workspaceId) ?? [];
  }

  getQueue(sessionId: string): QueuedMessage[] {
    return this.queues.get(sessionId) ?? [];
  }

  clear(): void {
    this.pendingRequests.clear();
    this.grantedPermissions.clear();
    this.permissionIndex.clear();
    this.queues.clear();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const { event, handler } of this.subscriptions) {
      this.client.off(event as Parameters<Jean2Client['off']>[0], handler as Parameters<Jean2Client['off']>[1]);
    }
    this.subscriptions = [];
    this.clear();
    this.removeAllListeners();
  }
}
