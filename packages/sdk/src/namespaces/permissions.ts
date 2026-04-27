import type { ClientMessage } from '../shared';

export class PermissionsNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  list(workspaceId: string, includeRevoked?: boolean): void {
    this.send({ type: 'permission.list', workspaceId, includeRevoked });
  }

  revoke(permissionId: string): void {
    this.send({ type: 'permission.revoke', permissionId });
  }

  revokeAll(workspaceId: string): void {
    this.send({ type: 'permission.revoke_all', workspaceId });
  }

  sync(): void {
    this.send({ type: 'permissions.sync' });
  }
}
