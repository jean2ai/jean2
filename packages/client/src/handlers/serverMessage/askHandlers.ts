import type { Ask, AskAuthority } from '@jean2/sdk';
import type { SessionHandlersContext } from './types';
import type { PendingAskRequest } from '@/stores/askStore';

export function handleAskRequest(
  msg: { type: 'ask.request'; sessionId: string; toolCallId: string; toolName: string; ask: Ask; requestId?: string; authority?: AskAuthority },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, toolCallId, toolName, ask, requestId } = msg;
  const { addPendingAskRequest, runAskHandlers, sendAskResponse } = ctx;

  const request: PendingAskRequest = {
    toolCallId,
    sessionId,
    toolName,
    ask,
    originSessionId: (ask as { _originSessionId?: string })._originSessionId,
    requestId,
  };

  // Derive target from ask type (PermissionAsk has implicit 'permission' target)
  const target = ask.type === 'permission' ? 'permission' 
    : ask.type === 'client_capability' ? 'client' 
    : 'human';

  // Play permission sound when the request will be shown to the user.
  // Uses canonical dedup key (requestId for permission asks, toolCallId as fallback)
  // to ensure the sound plays only once per unique permission, even when the same
  // permission surfaces across a subagent session tree.
  const maybePlayPermissionSound = () => {
    if (ask.type !== 'permission') return;
    const {
      sessionsRef,
      notifiedToolCallIdsRef,
      permissionSoundEnabledRef,
      playPermissionSound,
    } = ctx;
    const dedupKey = requestId ?? toolCallId;
    const session = sessionsRef.current.find(s => s.id === sessionId);
    if (session?.parentId === null && permissionSoundEnabledRef.current && !notifiedToolCallIdsRef.current.has(dedupKey)) {
      playPermissionSound();
      notifiedToolCallIdsRef.current.add(dedupKey);
    }
  };

  // Try programmatic handlers first
  const handlers = runAskHandlers(target, request);
  if (handlers) {
    handlers
      .then((result) => {
        if (result !== undefined) {
          sendAskResponse(toolCallId, result, requestId);
        } else {
          // No handler resolved it — show to user
          addPendingAskRequest(request);
          maybePlayPermissionSound();
        }
      })
      .catch(() => {
        // Handler errored — show to user
        addPendingAskRequest(request);
        maybePlayPermissionSound();
      });
  } else {
    // No handlers registered for this target — show to user
    addPendingAskRequest(request);
    maybePlayPermissionSound();
  }
}

export function handleAskTimeout(
  msg: { type: 'ask.timeout'; sessionId: string; toolCallId: string; requestId?: string },
  ctx: SessionHandlersContext,
): void {
  const { requestId, toolCallId } = msg;
  const { removePendingAskRequest, removePendingPermissionRequest } = ctx;
  // For permission asks, use requestId as canonical identity
  if (requestId) {
    removePendingPermissionRequest(requestId, toolCallId);
  } else {
    removePendingAskRequest(toolCallId);
  }
}

export function handleAskPendingSync(
  msg: {
    type: 'ask.pending_sync';
    sessionId: string;
    requests: Array<{
      sessionId: string;
      toolCallId: string;
      toolName: string;
      ask: Ask;
      requestId?: string;
      _originSessionId?: string;
      authority?: AskAuthority;
    }>;
  },
  ctx: SessionHandlersContext,
): void {
  const { replacePendingPermissionRequests } = ctx;

  // Convert server requests to PendingAskRequest format
  const requests: PendingAskRequest[] = msg.requests.map((r) => ({
    toolCallId: r.toolCallId,
    sessionId: r.sessionId,
    toolName: r.toolName,
    ask: r.ask,
    originSessionId: r._originSessionId,
    requestId: r.requestId,
  }));

  // Atomically replace all local permission asks with the authoritative server set.
  // This clears any stale entries from timeouts that the client missed (e.g., during disconnect).
  replacePendingPermissionRequests(requests);
}

export function handleAskResponseRejected(
  msg: {
    type: 'ask.response_rejected';
    sessionId: string;
    toolCallId: string;
    requestId?: string;
    code: string;
    message: string;
  },
  _ctx: SessionHandlersContext,
): void {
  console.warn(`Ask response rejected: [${msg.code}] ${msg.message} (sessionId=${msg.sessionId}, toolCallId=${msg.toolCallId})`);
}

export const askHandlers = {
  'ask.request': handleAskRequest,
  'ask.timeout': handleAskTimeout,
  'ask.pending_sync': handleAskPendingSync,
  'ask.response_rejected': handleAskResponseRejected,
} as const;