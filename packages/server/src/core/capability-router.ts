import type { AskAuthority, ClientCapability } from '@jean2/sdk';
import { getClientByClientId } from './client-registry';
import {
  getParticipantClientIds,
  getControllerConnections,
  getParticipantConnections,
} from './session-control-registry';
import type { RegisteredConnection } from './client-registry';
import type { ServerMessage } from '@jean2/sdk';

// =============================================================================
// Capability Router
//
// Provides capability-aware ask routing for Phase 7.
//
// Resolution modes:
// - controller_only:    Only the current controller can respond (Phase 5 default)
// - designated_clients: Only clients listed in allowedResponderClientIds can respond
// - first_eligible:     First connected client with matching capabilities can respond
//
// Visibility scopes:
// - controller_only:      Ask delivered only to controller's connections
// - session_participants: Ask delivered to all session participants' connections
// =============================================================================

// ── Capability matching ──────────────────────────────────────

/**
 * Check if a client has all the required capabilities.
 * Returns true if the client has every capability in the required list.
 * If requiredCapabilities is empty or undefined, any client passes.
 */
export function clientHasCapabilities(
  clientId: string,
  requiredCapabilities?: ClientCapability[],
): boolean {
  if (!requiredCapabilities || requiredCapabilities.length === 0) {
    return true;
  }

  const client = getClientByClientId(clientId);
  if (!client) return false;

  return requiredCapabilities.every(cap => client.capabilities.includes(cap));
}

/**
 * Check if a clientId is in the allowed responders list.
 * Returns true if allowedResponderClientIds is empty or undefined.
 */
export function isAllowedResponder(
  clientId: string,
  allowedResponderClientIds?: string[],
): boolean {
  if (!allowedResponderClientIds || allowedResponderClientIds.length === 0) {
    return true;
  }
  return allowedResponderClientIds.includes(clientId);
}

// ── Eligibility check ────────────────────────────────────────

export interface EligibilityCheck {
  eligible: boolean;
  reason?: string;
}

/**
 * Check if a client is eligible to respond to an ask with the given authority.
 *
 * This replaces the simple controller gate for ask.response validation.
 * It considers the resolutionMode, allowedResponderClientIds, and
 * requiredCapabilities from the AskAuthority.
 *
 * Note: For `controller_only` resolution mode, this delegates to the
 * existing controller check (the caller should use checkControllerGate
 * or verify controller status). This function handles the new modes.
 */
export function checkAskResponseEligibility(
  clientId: string,
  sessionId: string,
  controllerClientId: string | null,
  authority: AskAuthority,
): EligibilityCheck {
  const { resolutionMode, allowedResponderClientIds, requiredCapabilities } = authority;

  switch (resolutionMode) {
    case 'controller_only': {
      if (controllerClientId === null) {
        return { eligible: true };
      }
      if (clientId !== controllerClientId) {
        return {
          eligible: false,
          reason: 'Only the current controller can respond to this ask',
        };
      }
      return { eligible: true };
    }

    case 'designated_clients': {
      if (allowedResponderClientIds && allowedResponderClientIds.length > 0) {
        if (!allowedResponderClientIds.includes(clientId)) {
          return {
            eligible: false,
            reason: 'You are not an allowed responder for this ask',
          };
        }
      }

      if (!clientHasCapabilities(clientId, requiredCapabilities)) {
        return {
          eligible: false,
          reason: 'Your client does not have the required capabilities for this ask',
        };
      }

      return { eligible: true };
    }

    case 'first_eligible': {
      if (!clientHasCapabilities(clientId, requiredCapabilities)) {
        return {
          eligible: false,
          reason: 'Your client does not have the required capabilities for this ask',
        };
      }

      return { eligible: true };
    }

    default:
      return { eligible: false, reason: `Unknown resolution mode: ${resolutionMode}` };
  }
}

// ── Delivery target resolution ───────────────────────────────

export interface AskDeliveryTargets {
  connections: RegisteredConnection[];
  excludeControllerCheck: boolean;
}

/**
 * Resolve which connections should receive an ask based on its authority.
 *
 * Visibility scope determines who SEES the ask.
 * Resolution mode + capabilities determine who can RESPOND.
 *
 * These are intentionally separate concerns:
 * - An ask visible to session_participants but resolutionMode=controller_only
 *   means everyone sees it but only the controller can answer.
 * - An ask visible to controller_only with resolutionMode=designated_clients
 *   would be unusual but technically possible (controller sees it,
 *   designated non-controller clients would also need it — this is handled
 *   by the delivery function).
 */
export function resolveAskDeliveryTargets(
  sessionId: string,
  authority: AskAuthority,
): AskDeliveryTargets {
  const { visibilityScope, resolutionMode, allowedResponderClientIds, requiredCapabilities } = authority;

  // Base delivery: visibility scope determines initial audience
  if (visibilityScope === 'controller_only') {
    // Start with controller connections
    const controllerConns = getControllerConnections(sessionId);

    // For designated_clients or first_eligible, we may need to deliver beyond controller
    if (resolutionMode === 'designated_clients' && allowedResponderClientIds && allowedResponderClientIds.length > 0) {
      const allConns = getParticipantConnections(sessionId);
      const designatedConns = allConns.filter(conn =>
        conn.clientId && allowedResponderClientIds.includes(conn.clientId),
      );
      // Merge: controller + designated (dedup by connectionId)
      const seen = new Set(controllerConns.map(c => c.connectionId));
      for (const conn of designatedConns) {
        if (!seen.has(conn.connectionId)) {
          controllerConns.push(conn);
          seen.add(conn.connectionId);
        }
      }
      return { connections: controllerConns, excludeControllerCheck: true };
    }

    if (resolutionMode === 'first_eligible' && requiredCapabilities && requiredCapabilities.length > 0) {
      // Deliver to all participants with matching capabilities
      const allConns = getParticipantConnections(sessionId);
      const eligibleConns = allConns.filter(conn =>
        conn.clientId && clientHasCapabilities(conn.clientId, requiredCapabilities),
      );
      const seen = new Set(controllerConns.map(c => c.connectionId));
      for (const conn of eligibleConns) {
        if (!seen.has(conn.connectionId)) {
          controllerConns.push(conn);
          seen.add(conn.connectionId);
        }
      }
      return { connections: controllerConns, excludeControllerCheck: true };
    }

    return { connections: controllerConns, excludeControllerCheck: false };
  }

  // visibilityScope === 'session_participants'
  const allConns = getParticipantConnections(sessionId);

  if (resolutionMode === 'designated_clients' && allowedResponderClientIds && allowedResponderClientIds.length > 0) {
    const designatedConns = allConns.filter(conn =>
      conn.clientId && allowedResponderClientIds.includes(conn.clientId),
    );
    return { connections: designatedConns, excludeControllerCheck: true };
  }

  if (resolutionMode === 'first_eligible' && requiredCapabilities && requiredCapabilities.length > 0) {
    const eligibleConns = allConns.filter(conn =>
      conn.clientId && clientHasCapabilities(conn.clientId, requiredCapabilities),
    );
    return { connections: eligibleConns, excludeControllerCheck: true };
  }

  // Default: all participants see it, controller_only resolution
  return { connections: allConns, excludeControllerCheck: false };
}

// ── Send helpers ─────────────────────────────────────────────

/**
 * Send a message to the resolved delivery targets for an ask.
 * Falls back to controller-only delivery when no custom targets are needed.
 */
export function sendToAskTargets(
  sessionId: string,
  authority: AskAuthority,
  message: ServerMessage,
  sendFn: (ws: unknown, msg: ServerMessage) => void,
  excludeWs?: unknown,
): void {
  const targets = resolveAskDeliveryTargets(sessionId, authority);

  for (const conn of targets.connections) {
    if (excludeWs && conn.ws === excludeWs) continue;
    sendFn(conn.ws, message);
  }
}

/**
 * Get the list of clientIds eligible to respond to an ask.
 * Used for validation on ask.response.
 */
export function getEligibleResponderClientIds(
  sessionId: string,
  authority: AskAuthority,
): string[] {
  const { resolutionMode, allowedResponderClientIds, requiredCapabilities } = authority;

  switch (resolutionMode) {
    case 'controller_only':
      return [];

    case 'designated_clients': {
      if (allowedResponderClientIds && allowedResponderClientIds.length > 0) {
        return allowedResponderClientIds.filter(id => clientHasCapabilities(id, requiredCapabilities));
      }
      return getParticipantClientIds(sessionId).filter(id => clientHasCapabilities(id, requiredCapabilities));
    }

    case 'first_eligible':
      return getParticipantClientIds(sessionId).filter(id => clientHasCapabilities(id, requiredCapabilities));

    default:
      return [];
  }
}
