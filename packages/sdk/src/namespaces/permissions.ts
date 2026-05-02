import type { ClientMessage } from '../shared';

/**
 * Permissions namespace for managing persisted permission grants.
 *
 * Interactive permission prompts are handled via the ask.* protocol
 * (ask.request / ask.response). This namespace handles only the
 * management (list/revoke) of persisted grants after they've been
 * created through the ask flow.
 */
export class PermissionsNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  /**
   * List all permission grants for a workspace.
   */
  list(workspaceId: string, includeRevoked?: boolean): void {
    this.send({ type: 'permission.list', workspaceId, includeRevoked });
  }

  /**
   * Revoke a specific permission grant.
   */
  revoke(grantId: string): void {
    this.send({ type: 'permission.revoke', grantId });
  }

  /**
   * Revoke all permission grants for a workspace.
   */
  revokeAll(workspaceId: string): void {
    this.send({ type: 'permission.revoke_all', workspaceId });
  }
}
