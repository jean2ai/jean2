import type { ClientMessage } from '../shared';

/**
 * Permissions namespace for managing persisted permission grants.
 * Note: Interactive permission prompts are handled via ask.* protocol.
 */
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
}
