import type { ClientMessage } from '@jean2/shared';

export class PermissionsNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  respond(
    toolCallId: string,
    allowed: boolean,
    alwaysAllow: boolean,
  ): void {
    this.send({ type: 'permission.response', toolCallId, allowed, alwaysAllow });
  }

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
