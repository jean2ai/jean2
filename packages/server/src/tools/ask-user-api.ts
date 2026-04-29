import type { Ask, AskApi, PermissionAsk, AskPermissionResponse, GrantScope } from '@jean2/sdk';
import type { AskRequestMessage, AskTimedOutMessage } from '@jean2/sdk';
import { matchGrant, createGrantFromOptions } from '@/store/permissions';

// =============================================================================
// Canonical Permission Contract - Ask User API
//
// This module implements the ask.* channel for permission requests.
// Key behaviors:
// - Tools call ctx.ask({ type: 'permission', ... }) to request permission
// - Server checks stored grants via matchGrant()
// - If no grant, broadcasts ask.request to client and waits
// - Client responds with AskPermissionResponse { type: 'permission', grant: scope }
// - grant: 'deny' → deny; 'once' → one-time use (not persisted); other → persisted
// =============================================================================

interface PendingAsk {
  resolve: (response: boolean) => void;
  reject: (error: Error) => void;
  createdAt: number;
  ask: Ask;
  sessionId: string;
  toolName: string;
  workspaceId?: string;
  isPermissionAsk: boolean;
}

const pendingAsks = new Map<string, PendingAsk>();
const ASK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Tracks active timeout timers per ask
const askTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type AskBroadcastFn = (message: AskRequestMessage | AskTimedOutMessage) => void;

// =============================================================================
// Build Permission Key
// =============================================================================

function buildPermissionKey(
  toolName: string,
  resource: string | undefined,
  patterns: string[] | undefined,
): string {
  // For shell commands, use command pattern
  if (patterns && patterns.length > 0) {
    return patterns[0];
  }
  // For file operations, use resource/path
  if (resource) {
    return resource;
  }
  // Default: tool name
  return toolName;
}

// =============================================================================
// AskApi Factory
// =============================================================================

export function createAskApi(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  broadcastFn: AskBroadcastFn,
  workspaceId?: string,
): AskApi {
  let askCounter = 0;

  const ask = async (request: Ask): Promise<boolean> => {
    // Check if this is a permission ask
    const isPermissionAsk = request.type === 'permission';
    
    // Handle permission asks with grant matching
    if (isPermissionAsk && workspaceId) {
      const permAsk = request as PermissionAsk;
      
      const permissionKey = buildPermissionKey(
        toolName,
        permAsk.resource ?? 'file',
        permAsk.patterns,
      );

      // Check for existing matching grant
      const matchResult = matchGrant({
        workspaceId,
        toolName,
        resource: permAsk.resource ?? 'file',
        permissionKey,
      });
      
      if (matchResult.matched) {
        // For shell commands with operators, reject saved grants that could be over-broad.
        // Shell operators (&&, ||, |, >, >>, `, $( ) indicate the command contains
        // multiple operations - a grant for a specific base command (e.g., "curl") should
        // NOT auto-approve a command that chains to other dangerous operations (e.g., "curl X && rm -rf /").
        // The saved grant's pattern must specifically cover the full command content.
        const hasOperators = (permAsk.metadata as Record<string, unknown>)?.hasOperators === true;
        if (permAsk.resource === 'shell-command' && hasOperators) {
          // Reject auto-approval from saved grants when operators are present.
          // Force re-asking so user can review the full command with operators.
        } else {
          // Found existing grant - auto-approve
          return true;
        }
      }

      // No matching grant - need to ask user (broadcast below)
    }

    const askId = `${toolCallId}#${++askCounter}`;

    return new Promise<boolean>((resolve, reject) => {
      broadcastFn({
        type: 'ask.request',
        sessionId,
        toolCallId,
        toolName,
        ask: request,
      });

      pendingAsks.set(askId, {
        resolve: (granted: boolean) => {
          resolve(granted);
        },
        reject,
        createdAt: Date.now(),
        ask: request,
        sessionId,
        toolName,
        workspaceId,
        isPermissionAsk,
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

// =============================================================================
// Ask Resolution
// =============================================================================

/**
 * Resolve a pending ask with the user's response.
 * 
 * Handles the canonical AskPermissionResponse shape:
 * - { type: 'permission', grant: 'deny' } → deny (false)
 * - { type: 'permission', grant: 'once'|'session'|'workspace'|'always' } → grant (true)
 * - Other AskResponse types → passthrough
 * 
 * For permission asks, also handles grant persistence:
 * - 'once' scope: NOT persisted (one-time use only)
 * - 'session' scope: persisted with optional duration
 * - 'workspace' scope: persisted for all sessions in workspace
 * - 'always' scope: persisted until explicitly revoked
 */
export function resolveAsk(toolCallId: string, response: unknown): boolean {
  // Helper to determine if response grants permission
  function isGranted(resp: unknown): boolean | undefined {
    if (!resp || typeof resp !== 'object') return undefined;
    const r = resp as Record<string, unknown>;
    if (r.type !== 'permission') return undefined;
    const permResp = resp as AskPermissionResponse;
    return permResp.grant !== 'deny';
  }

  // Helper to persist grant from permission response
  function persistGrant(resp: AskPermissionResponse, request: Ask, wsId: string | undefined, pending: PendingAsk): void {
    if (!wsId || resp.grant === 'deny') return;
    
    const permAsk = request as PermissionAsk;
    let grantScope: GrantScope = resp.grant;
    
    // Defense-in-depth: shell commands with operators must not persist broad grants.
    // Operators (&&, ||, |, >, >>, `, $( )) indicate the command may chain to other
    // dangerous operations - a saved grant for the base command should not auto-approve
    // such compound commands. Force 'once' scope to prevent persistence.
    const hasOperators = (permAsk.metadata as Record<string, unknown>)?.hasOperators === true;
    if (permAsk.resource === 'shell-command' && hasOperators) {
      grantScope = 'once';
    }
    
    // Compute duration for session grants (default: 30 minutes)
    const duration = resp.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);
    
    // Create grant (createGrantFromOptions handles 'once' specially - not persisted)
    createGrantFromOptions({
      workspaceId: wsId,
      toolName: pending.toolName,
      resource: permAsk.resource ?? 'file',
      permissionKey: buildPermissionKey(
        pending.toolName,
        permAsk.resource ?? 'file',
        permAsk.patterns,
      ),
      grantOptions: {
        scope: grantScope,
        matcher: (permAsk.resource ?? 'file') === 'shell-command' ? 'shell-command' : 'exact',
        patterns: permAsk.patterns,
        duration: grantScope === 'session' ? duration : undefined,
        description: permAsk.question,
      },
    });
  }

  // Try exact match first (backward compat)
  if (pendingAsks.has(toolCallId)) {
    const pending = pendingAsks.get(toolCallId)!;
    clearAskTimer(toolCallId);
    
    // Handle permission ask responses with grant persistence
    const granted = isGranted(response);
    if (granted !== undefined && pending.isPermissionAsk) {
      const permResponse = response as AskPermissionResponse;
      persistGrant(permResponse, pending.ask, pending.workspaceId, pending);
      pending.resolve(granted);
    } else {
      // For non-permission asks or unknown response type, pass through
      pending.resolve(granted ?? false);
    }
    
    pendingAsks.delete(toolCallId);
    removePendingAsksByToolCallId(toolCallId);
    return true;
  }

  // Try matching by toolCallId prefix (handles askId format: "toolCallId#N")
  for (const [key, pending] of pendingAsks) {
    if (key.startsWith(`${toolCallId}#`) || key === toolCallId) {
      clearAskTimer(key);
      
      const granted = isGranted(response);
      if (granted !== undefined && pending.isPermissionAsk) {
        const permResponse = response as AskPermissionResponse;
        persistGrant(permResponse, pending.ask, pending.workspaceId, pending);
        pending.resolve(granted);
      } else {
        pending.resolve(granted ?? false);
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

// =============================================================================
// Pending Ask Persistence (for reconnection recovery)
// =============================================================================

import { createPendingAsk, removePendingAsksByToolCallId, listPendingAsksBySession as _listPendingAsksBySession } from '@/store/pending-asks';

export { listPendingAsksBySession } from '@/store/pending-asks';
