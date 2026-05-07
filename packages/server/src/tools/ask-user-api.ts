import type { Ask, AskApi, AskPermissionResponse, GrantScope, ClientCapability } from '@jean2/sdk';
import type { AskAuthority } from '@jean2/sdk';
import type { AskRequestMessage, AskTimedOutMessage } from '@jean2/sdk';
import {
  SHELL_DANGEROUS_COMMANDS,
  SHELL_FILESYSTEM_COMMANDS,
} from '@jean2/sdk';
import {
  createGrantFromOptions,
} from '@/store/permissions';
import {
  createPendingAsk,
  removePendingAsksByToolCallId,
  getPermissionRequestByRequestId,
} from '@/store/pending-asks';
import {
  requestPermission,
  resolvePermission as resolvePermissionRequest,
  rejectPermissionsBySession,
  rejectPermissionsByToolCallId,
} from '@/tools/permission-request-manager';

// =============================================================================
// Ask User API
//
// This module provides the public API for tools to ask questions to users.
//
// Permission asks (type === 'permission') are routed through the dedicated
// permission-request-manager, which uses DB-backed request records and
// resolves by requestId.
//
// Generic asks (type !== 'permission') remain under the legacy in-memory
// path for now. They will be migrated in a future phase.
// =============================================================================

// =============================================================================
// Legacy in-memory ask handling (generic asks only)
// =============================================================================

interface PendingAsk {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  createdAt: number;
  ask: Ask;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  workspaceId?: string;
  isPermissionAsk: boolean;
  broadcastFn: AskBroadcastFn;
  authority?: AskAuthority;
}

const pendingAsks = new Map<string, PendingAsk>();
export const ASK_TIMEOUT = 5 * 60 * 1000;
const askTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEFAULT_ASK_AUTHORITY: AskAuthority = {
  visibilityScope: 'controller_only',
  resolutionMode: 'controller_only',
};

export type AskBroadcastFn = (message: AskRequestMessage | AskTimedOutMessage) => void;

// =============================================================================
// Create Ask API (used by tools)
// =============================================================================

function resolveAuthorityForAsk(request: Ask): AskAuthority {
  if (
    request.type === 'client_capability' &&
    'target' in request &&
    request.target === 'client'
  ) {
    return {
      visibilityScope: 'global',
      resolutionMode: 'first_eligible',
      requiredCapabilities: [request.capability as ClientCapability],
    };
  }
  return DEFAULT_ASK_AUTHORITY;
}

export function createAskApi(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  broadcastFn: AskBroadcastFn,
  workspaceId?: string,
  rootSessionId?: string,
): AskApi {
  let askCounter = 0;

  const ask = async (request: Ask): Promise<unknown> => {
    const isPermissionAsk = request.type === 'permission';

    // Route permission asks through the dedicated permission-request-manager
    if (isPermissionAsk) {
      return requestPermission({
        sessionId,
        rootSessionId,
        toolCallId,
        toolName,
        ask: request,
        broadcastFn: broadcastFn as unknown as Parameters<typeof requestPermission>[0]['broadcastFn'],
        workspaceId,
        timeoutMs: ASK_TIMEOUT,
      });
    }

    // Generic asks: legacy in-memory path
    const askId = `${toolCallId}#${++askCounter}`;
    const authority = resolveAuthorityForAsk(request);

    return new Promise<unknown>((resolve, reject) => {
      broadcastFn({
        type: 'ask.request',
        sessionId,
        toolCallId,
        toolName,
        ask: request,
        authority,
      });

      pendingAsks.set(askId, {
        resolve: (response: unknown) => {
          resolve(response);
        },
        reject,
        createdAt: Date.now(),
        ask: request,
        sessionId,
        toolCallId,
        toolName,
        workspaceId,
        isPermissionAsk,
        broadcastFn,
        authority,
      });

      createPendingAsk({
        sessionId,
        toolCallId,
        toolName,
        ask: request,
        createdAt: Date.now(),
        requestId: askId,
        status: 'pending',
        isPermission: false,
        workspaceId,
      });

      const timerId = setTimeout(() => {
        if (pendingAsks.has(askId)) {
          pendingAsks.delete(askId);
          askTimers.delete(askId);
          removePendingAsksByToolCallId(toolCallId);
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

// =============================================================================
// Resolve / Reject — handles both permission and generic asks
// =============================================================================

function extractResolutionValue(response: unknown): unknown {
  if (!response || typeof response !== 'object') return response;

  const r = response as Record<string, unknown>;

  switch (r.type as string) {
    case 'single_select':
      return r.value as string;
    case 'multi_select':
      return r.values as string[];
    case 'text':
      return r.value as string;
    case 'confirm':
      return r.confirmed as boolean;
    case 'form':
      return response;
    case 'client_capability':
      return r.result as unknown;
    default:
      return response;
  }
}

function buildPermissionKey(
  toolName: string,
  resource: string | undefined,
  patterns: string[] | undefined,
): string {
  if (patterns && patterns.length > 0) {
    return patterns[0];
  }
  if (resource) {
    return resource;
  }
  return toolName;
}

function isDangerousShellIdentity(identity: string | undefined): boolean {
  if (!identity) return false;
  const lower = identity.toLowerCase();

  const dangerous = SHELL_DANGEROUS_COMMANDS.some(command => lower === command || lower.startsWith(command + ' '));
  if (dangerous) {
    return true;
  }

  return SHELL_FILESYSTEM_COMMANDS.some(command => lower === command || lower.startsWith(command + ' '));
}

// Legacy grant persistence for generic asks that happen to be permission-like
function persistGrant(resp: AskPermissionResponse, request: Ask, wsId: string | undefined, pending: PendingAsk): void {
  if (!wsId || resp.grant === 'deny') return;

  const permAsk = request as import('@jean2/sdk').PermissionAsk;
  let grantScope: GrantScope = resp.grant;

  // If intents are available, use intent-based persistence
  if (permAsk.intents && permAsk.intents.length > 0) {
    const intent = permAsk.intents[0];

    // Enforce scope policy: allowedScopes is the canonical source of truth.
    // If the user's chosen scope is not in the intent's allowedScopes, reject it.
    if (!intent.allowedScopes.includes(grantScope)) {
      return;
    }
    if (grantScope === 'once') return;

    const duration = resp.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);
    for (const target of intent.targets) {
      createGrantFromOptions({
        workspaceId: wsId,
        toolName: pending.toolName,
        resource: intent.resource,
        action: intent.action,
        permissionKey: target.target,
        grantOptions: {
          scope: grantScope,
          matcher: target.matcher === 'prefix' ? 'prefix' : 'exact',
          patterns: [target.target],
          action: intent.action,
          duration: grantScope === 'session' ? duration : undefined,
          description: permAsk.question,
        },
      });
    }
    return;
  }

  // Legacy fallback
  const metadata = permAsk.metadata as Record<string, unknown> | undefined;
  const identity = typeof metadata?.baseCommand === 'string' ? metadata.baseCommand : undefined;

  if (permAsk.resource === 'shell-command' && isDangerousShellIdentity(identity)) {
    grantScope = 'once';
  }

  const duration = resp.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);

  createGrantFromOptions({
    workspaceId: wsId,
    toolName: pending.toolName,
    resource: permAsk.resource ?? 'file',
    action: permAsk.action,
    permissionKey: buildPermissionKey(
      pending.toolName,
      permAsk.resource ?? 'file',
      permAsk.patterns,
    ),
    grantOptions: {
      scope: grantScope,
      matcher: (permAsk.resource ?? 'file') === 'shell-command' ? 'shell-command' : 'exact',
      patterns: permAsk.patterns,
      action: permAsk.action,
      duration: grantScope === 'session' ? duration : undefined,
      description: permAsk.question,
    },
  });
}

function isGranted(resp: unknown): boolean | undefined {
  if (!resp || typeof resp !== 'object') return undefined;
  const r = resp as Record<string, unknown>;
  if (r.type !== 'permission') return undefined;
  const permResp = resp as AskPermissionResponse;
  return permResp.grant !== 'deny';
}

export function resolveAsk(toolCallId: string, response: unknown, requestId?: string): boolean {
  // If requestId is provided, route to the permission-request-manager
  // This handles permission asks from the new codepath
  if (requestId) {
    return resolvePermissionRequest(requestId, response);
  }

  // Legacy path: resolve by toolCallId-based keys
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    clearAskTimer(toolCallId);
    const granted = isGranted(response);
    if (granted !== undefined && pending.isPermissionAsk) {
      const permResponse = response as AskPermissionResponse;
      persistGrant(permResponse, pending.ask, pending.workspaceId, pending);
      pending.resolve(granted);
    } else {
      pending.resolve(extractResolutionValue(response));
    }
    pendingAsks.delete(toolCallId);
    removePendingAsksByToolCallId(toolCallId);
    return true;
  }

  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      clearAskTimer(key);
      const granted = isGranted(response);
      if (granted !== undefined && pending.isPermissionAsk) {
        const permResponse = response as AskPermissionResponse;
        persistGrant(permResponse, pending.ask, pending.workspaceId, pending);
        pending.resolve(granted);
      } else {
        pending.resolve(extractResolutionValue(response));
      }
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

/**
 * Reject all pending asks (permission + legacy) for a specific toolCallId.
 * Used when a tool execution ends (timeout/error/completion) to clean up
 * any lingering asks the tool was waiting on.
 * Broadcasts ask.timeout so the client removes the UI prompt.
 */
export function rejectPendingAsksByToolCallId(toolCallId: string, error?: Error): string[] {
  const rejectedIds: string[] = [];
  const timeoutError = error ?? new Error('Tool execution ended');

  // Reject permission asks through the permission-request-manager
  const rejectedRequestIds = rejectPermissionsByToolCallId(toolCallId, timeoutError);
  rejectedIds.push(...rejectedRequestIds);

  // Reject legacy generic asks
  for (const [askId, pending] of pendingAsks) {
    if (pending.toolCallId === toolCallId || askId === toolCallId || askId.startsWith(`${toolCallId}#`)) {
      clearAskTimer(askId);
      // Broadcast ask.timeout so the client removes the UI prompt
      pending.broadcastFn({
        type: 'ask.timeout',
        sessionId: pending.sessionId,
        toolCallId: pending.toolCallId,
      });
      pending.reject(timeoutError);
      pendingAsks.delete(askId);
      removePendingAsksByToolCallId(pending.toolCallId);
      rejectedIds.push(askId);
    }
  }

  return rejectedIds;
}

export function rejectPendingAsksBySession(sessionId: string, error?: Error): string[] {
  const rejectedAskIds: string[] = [];
  const interruptError = error ?? new Error('Session interrupted');

  // Reject permission asks through the permission-request-manager
  const rejectedRequestIds = rejectPermissionsBySession(sessionId, interruptError);
  rejectedAskIds.push(...rejectedRequestIds);

  // Reject legacy generic asks
  for (const [askId, pending] of pendingAsks) {
    if (pending.sessionId === sessionId) {
      clearAskTimer(askId);
      pending.reject(interruptError);
      pendingAsks.delete(askId);
      removePendingAsksByToolCallId(pending.toolCallId);
      rejectedAskIds.push(askId);
    }
  }

  return rejectedAskIds;
}

export function hasPendingAsk(toolCallId: string): boolean {
  if (pendingAsks.has(toolCallId)) return true;
  for (const key of pendingAsks.keys()) {
    if (key.startsWith(`${toolCallId}#`)) return true;
  }
  return false;
}

export function getAuthorityForPendingAsk(toolCallId: string): AskAuthority | undefined {
  if (pendingAsks.has(toolCallId)) {
    return pendingAsks.get(toolCallId)?.authority;
  }
  for (const [key, pending] of pendingAsks) {
    if (key === toolCallId || key.startsWith(`${toolCallId}#`)) {
      return pending.authority;
    }
  }
  return undefined;
}

export function getSessionIdForPendingAsk(toolCallId: string, requestId?: string): string | null {
  if (requestId) {
    const record = getPermissionRequestByRequestId(requestId);
    if (record) return record.sessionId;
  }
  if (pendingAsks.has(toolCallId)) {
    return pendingAsks.get(toolCallId)!.sessionId;
  }
  for (const [key, pending] of pendingAsks) {
    if (key === toolCallId || key.startsWith(`${toolCallId}#`)) {
      return pending.sessionId;
    }
  }
  if (!requestId) {
    const record = getPermissionRequestByRequestId(toolCallId);
    if (record) return record.sessionId;
  }
  return null;
}

function clearAskTimer(askId: string): void {
  const timer = askTimers.get(askId);
  if (timer) {
    clearTimeout(timer);
    askTimers.delete(askId);
  }
}

// Re-export for backward compatibility — but reconnect should use
// getPendingRequestsByRootSession from permission-request-manager for
// permission asks
export { listPendingAsksBySession, listPendingAsksByRootSession } from '@/store/pending-asks';
