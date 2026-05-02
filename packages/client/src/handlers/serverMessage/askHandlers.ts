import type { Ask } from '@jean2/sdk';
import type { SessionHandlersContext } from './types';
import type { PendingAskRequest } from '@/stores/askStore';

export function handleAskRequest(
  msg: { type: 'ask.request'; sessionId: string; toolCallId: string; toolName: string; ask: Ask; requestId?: string },
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
        }
      })
      .catch(() => {
        // Handler errored — show to user
        addPendingAskRequest(request);
      });
  } else {
    // No handlers registered for this target — show to user
    addPendingAskRequest(request);
  }
}

export function handleAskTimeout(
  msg: { type: 'ask.timeout'; sessionId: string; toolCallId: string; requestId?: string },
  ctx: SessionHandlersContext,
): void {
  const { toolCallId } = msg;
  const { removePendingAskRequest } = ctx;
  removePendingAskRequest(toolCallId);
}

export const askHandlers = {
  'ask.request': handleAskRequest,
  'ask.timeout': handleAskTimeout,
} as const;