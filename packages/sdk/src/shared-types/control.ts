export type SessionControlStatus =
  | 'uncontrolled'
  | 'controlled'
  | 'takeover_requested'
  | 'grace';

export interface SessionControlState {
  sessionId: string;
  controllerClientId: string | null;
  controllerConnectionId?: string | null;
  acquiredAt?: number | null;
  leaseExpiresAt?: number | null;
  lastHeartbeatAt?: number | null;
  status: SessionControlStatus;
  pendingTakeover?: {
    requestedByClientId: string;
    requestedAt: number;
  } | null;
}

export interface SessionParticipantInfo {
  clientId: string;
  connectionIds: Set<string>;
}

// =============================================================================
// Client Capabilities
//
// Declared by clients during registration. Used by the server for
// capability-aware ask routing in Phase 7.
// =============================================================================

export type ClientCapability =
  | 'chat_ui'
  | 'ask_ui'
  | 'browser_automation'
  | 'tab_context'
  | 'notifications'
  | 'terminal_ui'
  | 'file_picker';

export const CLIENT_CAPABILITIES: readonly ClientCapability[] = [
  'chat_ui',
  'ask_ui',
  'browser_automation',
  'tab_context',
  'notifications',
  'terminal_ui',
  'file_picker',
] as const;

// =============================================================================
// Ask Authority
//
// Governs who can see an ask and who can respond to it.
// =============================================================================

export interface AskAuthority {
  visibilityScope: 'controller_only' | 'session_participants';
  resolutionMode: 'controller_only' | 'designated_clients' | 'first_eligible';
  allowedResponderClientIds?: string[];
  requiredCapabilities?: ClientCapability[];
}
