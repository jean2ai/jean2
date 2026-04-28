import type { Ask, AskApi, PermissionAsk, AskPermissionResponse } from '@jean2/sdk';
import type { AskRequestMessage, AskTimedOutMessage } from '@jean2/sdk';
import { checkCachedPermission, grantPermission } from '@/store';
import { createPendingAsk, removePendingAsksByToolCallId } from '@/store/pending-asks';

interface PendingAsk {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  createdAt: number;
  ask: Ask;
  sessionId: string;
  toolName: string;
}

const pendingAsks = new Map<string, PendingAsk>();
const ASK_TIMEOUT = 5 * 60 * 1000;

// Tracks active timeout timers per ask
const askTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type AskBroadcastFn = (message: AskRequestMessage | AskTimedOutMessage) => void;

export function createAskApi(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  broadcastFn: AskBroadcastFn,
  workspaceId?: string,
): AskApi {
  let askCounter = 0;

  const ask = async (request: Ask): Promise<unknown> => {
    // Handle permission asks with caching
    if (request.target === 'permission' && workspaceId) {
      const permAsk = request as PermissionAsk & { target: 'permission' };
      const permissionKey = (permAsk.metadata?.permissionKey as string) || `tool:${toolName}`;
      const permissionType = (permAsk.metadata?.permissionType as 'tool' | 'action') || 'tool';

      const cached = checkCachedPermission(
        workspaceId,
        toolName,
        permissionType,
        permissionKey,
      );
      if (cached?.allowed) {
        return true;
      }
    }

    const askId = `${toolCallId}#${++askCounter}`;

    return new Promise<unknown>((resolve, reject) => {
      broadcastFn({
        type: 'ask.request',
        sessionId,
        toolCallId,
        toolName,
        ask: request,
      });

      pendingAsks.set(askId, {
        resolve: (response: unknown) => {
          // If this was a permission ask with alwaysAllow, persist it
          if (request.target === 'permission' && workspaceId) {
            const permResponse = response as AskPermissionResponse;
            if (permResponse?.allowed && permResponse?.alwaysAllow) {
              const permAsk = request as PermissionAsk & { target: 'permission' };
              const permissionKey = (permAsk.metadata?.permissionKey as string) || `tool:${toolName}`;
              const permissionType = (permAsk.metadata?.permissionType as 'tool' | 'action') || 'tool';
              grantPermission({
                workspaceId,
                toolName,
                permissionType,
                permissionKey,
                allowed: true,
                grantedBy: sessionId,
                metadata: { message: permAsk.question },
              });
            }
          }
          resolve(response);
        },
        reject,
        createdAt: Date.now(),
        ask: request,
        sessionId,
        toolName,
      });

      // Persist to DB for recovery on client reconnection
      createPendingAsk({
        sessionId,
        toolCallId,
        toolName,
        ask: request,
        createdAt: Date.now(),
      });

      // Set timeout and emit ask.timeout on expiration
      const timerId = setTimeout(() => {
        if (pendingAsks.has(askId)) {
          pendingAsks.delete(askId);
          askTimers.delete(askId);
          removePendingAsksByToolCallId(toolCallId);
          // Emit ask.timeout so client can clean up UI
          broadcastFn({
            type: 'ask.timeout',
            sessionId,
            toolCallId,
          });
          reject(new Error('User did not respond in time'));
        }
      }, ASK_TIMEOUT);
      askTimers.set(askId, timerId);
    });
  };

  return ask as AskApi;
}

export function resolveAsk(toolCallId: string, response: unknown): boolean {
  // Try exact match first (backward compat)
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    clearAskTimer(toolCallId);
    pending.resolve(response);
    pendingAsks.delete(toolCallId);
    removePendingAsksByToolCallId(toolCallId);
    return true;
  }

  // Try matching by toolCallId prefix (handles askId format: "toolCallId#N")
  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      clearAskTimer(key);
      pending.resolve(response);
      pendingAsks.delete(key);
      removePendingAsksByToolCallId(toolCallId);
      return true;
    }
  }

  return false;
}

export function rejectAsk(toolCallId: string, error: Error): boolean {
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    clearAskTimer(toolCallId);
    pending.reject(error);
    pendingAsks.delete(toolCallId);
    removePendingAsksByToolCallId(toolCallId);
    return true;
  }

  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      clearAskTimer(key);
      pending.reject(error);
      pendingAsks.delete(key);
      removePendingAsksByToolCallId(toolCallId);
      return true;
    }
  }

  return false;
}

export function hasPendingAsk(toolCallId: string): boolean {
  if (pendingAsks.has(toolCallId)) return true;
  for (const key of pendingAsks.keys()) {
    if (key.startsWith(`${toolCallId}#`)) return true;
  }
  return false;
}

function clearAskTimer(askId: string): void {
  const timer = askTimers.get(askId);
  if (timer) {
    clearTimeout(timer);
    askTimers.delete(askId);
  }
}

// Export for recovery on client reconnection
export { listPendingAsksBySession } from '@/store/pending-asks';
