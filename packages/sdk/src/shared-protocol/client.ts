// No permission type imports needed — permission grant/deny messages removed.
// All permission responses go through ask.response (AskResponseMessage).

// =============================================================================
// Client Control: Descriptor
// =============================================================================

export interface ClientDescriptor {
  clientId: string;
  clientType: 'desktop' | 'web' | 'extension' | 'sdk' | 'mobile';
  displayName: string;
  interactionMode: 'human' | 'headless' | 'hybrid';
  capabilities: string[];
  instanceMetadata?: Record<string, unknown>;
}

// =============================================================================
// Client Control: Registration (Client → Server)
// =============================================================================

export interface ClientRegisterMessage {
  type: 'client.register';
  client: ClientDescriptor;
  reconnectToken?: string;
  currentSessionId?: string;
}

export interface SessionCreateMessage {
  type: 'session.create';
  workspaceId?: string;
  preconfigId?: string;
  title?: string;
}

export interface SessionResumeMessage {
  type: 'session.resume';
  sessionId: string;
}

import type { AttachmentKind } from '../shared-types/model';
import type { AskResponse } from '../shared-types/tool';

export interface ChatMessageAttachment {
  id: string;
  kind: AttachmentKind;
}

export interface ChatMessage {
  type: 'chat.message';
  sessionId: string;
  content: string;
  attachments?: ChatMessageAttachment[];
  responseFormatId?: string;
}

export interface SessionCloseMessage {
  type: 'session.close';
  sessionId: string;
}

export interface SessionUpdateMessage {
  type: 'session.update';
  sessionId: string;
  preconfigId?: string;
}

export interface SessionUpdateModelMessage {
  type: 'session.update_model';
  sessionId: string;
  modelId: string;
  providerId: string;
  variant?: string;
}

export interface SessionReopenMessage {
  type: 'session.reopen';
  sessionId: string;
}

export interface SessionDeleteMessage {
  type: 'session.delete';
  sessionId: string;
}

export interface SessionGenerateTitleMessage {
  type: 'session.generate_title';
  sessionId: string;
}

export interface SessionRenameMessage {
  type: 'session.rename';
  sessionId: string;
  title: string;
}

// =============================================================================
// Permission Grant Management (Client → Server)
// =============================================================================

export interface PermissionListRequestMessage {
  type: 'permission.list';
  workspaceId: string;
  includeRevoked?: boolean;
}

export interface PermissionRevokeMessage {
  type: 'permission.revoke';
  grantId: string;
}

export interface PermissionRevokeAllMessage {
  type: 'permission.revoke_all';
  workspaceId: string;
}



// =============================================================================
// Compaction Messages
// =============================================================================

export interface SessionCompactMessage {
  type: 'session.compact';
  sessionId: string;
}

// =============================================================================
// Revert Messages
// =============================================================================

export interface SessionRevertMessage {
  type: 'session.revert';
  sessionId: string;
  messageId: string;
}

// =============================================================================
// Fork Messages
// =============================================================================

export interface SessionForkMessage {
  type: 'session.fork';
  sessionId: string;
  messageId: string;
  title?: string;
}

// =============================================================================
// Interrupt Messages
// =============================================================================

export interface SessionInterruptMessage {
  type: 'session.interrupt';
  sessionId: string;
  reason?: 'user_request' | 'timeout' | 'error';
}

// =============================================================================
// Queue Messages
// =============================================================================

export interface QueueAddMessage {
  type: 'queue.add';
  sessionId: string;
  content: string;
  attachments?: ChatMessageAttachment[];
  responseFormatId?: string;
}

export interface QueueRemoveMessage {
  type: 'queue.remove';
  queueId: string;
}

export interface ProviderConnectMessage {
  type: 'provider.connect';
  provider: string;
}

export interface ProviderDisconnectMessage {
  type: 'provider.disconnect';
  provider: string;
}

// =============================================================================
// Ask Messages (Client → Server)
// =============================================================================

export interface AskResponseMessage {
  type: 'ask.response';
  toolCallId: string;
  response: AskResponse;
  /** Canonical request identity for permission asks. Used to correlate responses. */
  requestId?: string;
}

export interface SandboxTextResponse {
  type: 'text';
  content: string;
}

export interface SandboxToolCallResponse {
  type: 'tool-call';
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
}

export interface SandboxMultiToolCallResponse {
  type: 'multi-tool-call';
  calls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    toolCallId?: string;
  }>;
}

export interface SandboxErrorResponse {
  type: 'error';
  error: string;
  errorType?: 'rate_limit' | 'server' | 'timeout' | 'auth' | 'invalid_request';
}

export interface SandboxReasoningResponse {
  type: 'reasoning';
  reasoning: string;
  text: string;
}

export type SandboxResponse =
  | SandboxTextResponse
  | SandboxToolCallResponse
  | SandboxMultiToolCallResponse
  | SandboxErrorResponse
  | SandboxReasoningResponse;

export interface SandboxRespondMessage {
  type: 'sandbox.respond';
  callId: string;
  response: SandboxResponse;
}

// =============================================================================
// Control Action Messages (Client → Server)
// =============================================================================

export interface SessionControlClaimMessage {
  type: 'session.control.claim';
  sessionId: string;
}

export interface SessionControlReleaseMessage {
  type: 'session.control.release';
  sessionId: string;
}

export interface SessionControlRequestTakeoverMessage {
  type: 'session.control.request_takeover';
  sessionId: string;
}

export type TakeoverDecision = 'approve' | 'deny';

export interface SessionControlRespondTakeoverMessage {
  type: 'session.control.respond_takeover';
  sessionId: string;
  requesterClientId: string;
  decision: TakeoverDecision;
}

// =============================================================================
// Heartbeat Messages
// =============================================================================

export interface PongMessage {
  type: 'pong';
}

export type ClientMessage = 
  | ClientRegisterMessage
  | SessionCreateMessage 
  | SessionResumeMessage
  | ChatMessage
  | SessionCloseMessage
  | SessionUpdateMessage
  | SessionUpdateModelMessage
  | SessionReopenMessage
  | SessionDeleteMessage
  | SessionRenameMessage
  | SessionGenerateTitleMessage
  | PermissionListRequestMessage
  | PermissionRevokeMessage
  | PermissionRevokeAllMessage
  | SessionCompactMessage
  | SessionRevertMessage
  | SessionForkMessage
  | SessionInterruptMessage
  | QueueAddMessage
  | QueueRemoveMessage
  | ProviderConnectMessage
  | ProviderDisconnectMessage
  | AskResponseMessage
  | SandboxRespondMessage
  | SessionControlClaimMessage
  | SessionControlReleaseMessage
  | SessionControlRequestTakeoverMessage
  | SessionControlRespondTakeoverMessage
  | PongMessage;