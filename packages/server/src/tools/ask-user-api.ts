import type { Ask, AskApi, PermissionAsk } from '@jean2/sdk';
import { checkCachedPermission, grantPermission } from '@/store';

interface PendingAsk {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  createdAt: number;
  ask: Ask;
}

const pendingAsks = new Map<string, PendingAsk>();
const ASK_TIMEOUT = 5 * 60 * 1000;

export type AskBroadcastFn = (message: {
  type: 'ask.request';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  ask: Ask;
}) => void;

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
            const permResponse = response as { allowed: boolean; alwaysAllow?: boolean };
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
      });

      setTimeout(() => {
        if (pendingAsks.has(askId)) {
          pendingAsks.delete(askId);
          reject(new Error('User did not respond in time'));
        }
      }, ASK_TIMEOUT);
    });
  };

  return ask as AskApi;
}

export function resolveAsk(toolCallId: string, response: unknown): boolean {
  // Try exact match first (backward compat)
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    pending.resolve(response);
    pendingAsks.delete(toolCallId);
    return true;
  }

  // Try matching by toolCallId prefix (handles askId format: "toolCallId#N")
  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      pending.resolve(response);
      pendingAsks.delete(key);
      return true;
    }
  }

  return false;
}

export function rejectAsk(toolCallId: string, error: Error): boolean {
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    pending.reject(error);
    pendingAsks.delete(toolCallId);
    return true;
  }

  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      pending.reject(error);
      pendingAsks.delete(key);
      return true;
    }
  }

  return false;
}

export function cleanupExpiredAskRequests(): void {
  const now = Date.now();
  for (const [id, pending] of pendingAsks) {
    if (now - pending.createdAt > ASK_TIMEOUT) {
      pending.reject(new Error('User did not respond in time'));
      pendingAsks.delete(id);
    }
  }
}

export function hasPendingAsk(toolCallId: string): boolean {
  if (pendingAsks.has(toolCallId)) return true;
  for (const key of pendingAsks.keys()) {
    if (key.startsWith(`${toolCallId}#`)) return true;
  }
  return false;
}

// Legacy aliases for backward compatibility
export { resolveAsk as resolveAskUser, rejectAsk as rejectAskUser, hasPendingAsk as hasPendingAskUser, cleanupExpiredAskRequests as cleanupExpiredAskUserRequests };
