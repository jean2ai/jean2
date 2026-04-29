import type { ClientMessage } from '../shared';
import type { GrantScope, PermissionDuration } from '../shared-types/permission';

/**
 * Permissions namespace for managing persisted permission grants.
 * Note: Interactive permission prompts are handled via ask.* protocol.
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

/**
 * Permission Grant namespace for structured grant responses.
 * Used when responding to permission ask requests.
 */
export class PermissionGrantNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  /**
   * Grant permission for a request.
   * Used when user approves a permission ask.
   */
  grant(
    requestId: string,
    grantedScopes: GrantScope[],
    options?: {
      rememberDecision?: boolean;
      rememberDuration?: PermissionDuration;
      userNote?: string;
    }
  ): void {
    this.send({
      type: 'permission.grant',
      requestId,
      grantedScopes,
      ...options,
    });
  }

  /**
   * Deny a permission request.
   * Used when user denies a permission ask.
   */
  deny(requestId: string, reason?: string): void {
    this.send({
      type: 'permission.deny',
      requestId,
      reason,
    });
  }
}