import type { Ask, AskApi, PermissionAsk, AskPermissionResponse, GrantScope } from '@jean2/sdk';
import type { AskRequestMessage, AskTimedOutMessage } from '@jean2/sdk';
import {
  matchGrant,
  createGrantFromOptions,
} from '@/store/permissions';

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

// =============================================================================
// Shell Command Safety Helpers
// =============================================================================

/**
 * Checks if a shell command with operators is safe to auto-match/persist.
 * Dangerous commands with operators should be re-asked each time for safety.
 */
function isDangerousOperatorCommand(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;

  const hasOperators = metadata.hasOperators === true;
  if (!hasOperators) return false; // No operators = always safe

  const baseCommand = (metadata.baseCommand as string | undefined) || '';
  
  // Import dangerous/filesystem commands inline to avoid circular deps
  const SHELL_DANGEROUS = ['rm', 'rmdir', 'del', 'erase', 'sudo', 'su', 'doas', 
    'chmod', 'chown', 'dd', 'mkfs', 'format', 'shutdown', 'reboot', 'halt',
    'iptables', 'ufw', 'firewall-cmd', 'curl', 'wget', 'nc', 'netcat', 'eval', 'exec'];
  const SHELL_FILESYSTEM = ['mv', 'cp', 'mkdir', 'touch', 'ln'];
  
  return SHELL_DANGEROUS.includes(baseCommand) || SHELL_FILESYSTEM.includes(baseCommand);
}

// =============================================================================
// Types
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

  const ask = async (request: Ask): Promise<unknown> => {
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
        // For dangerous operator commands (rm |, cat | grep), force re-ask each time
        // for safety. Safe operator commands (cat file | head) can auto-match.
        const metadata = permAsk.metadata as Record<string, unknown> | undefined;
        if (permAsk.resource === 'shell-command' && isDangerousOperatorCommand(metadata)) {
          // Dangerous operator command - reject auto-approval, force user re-ask
        } else {
          // Found existing grant - auto-approve
          return true;
        }
      }

      // No matching grant - need to ask user (broadcast below)
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
 * Extract the resolution value from an ask response per AskApi contract.
 *
 * Maps each ask type to the expected runtime value:
 * - single_select  → value (string)
 * - multi_select    → values (string[])
 * - text           → value (string)
 * - confirm        → confirmed (boolean)
 * - form           → full AskFormResponse
 * - client_capability → result (unknown)
 * - permission     → already handled above (boolean)
 */
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
      // Return full AskFormResponse shape
      return response;

    case 'client_capability':
      return r.result as unknown;

    default:
      // Passthrough for unknown/unexpected types
      return response;
  }
}

/**
 * Resolve a pending ask with the user's response.
 *
 * Handles the canonical AskPermissionResponse shape:
 * - { type: 'permission', grant: 'deny' } → deny (false)
 * - { type: 'permission', grant: 'once'|'session'|'workspace'|'always' } → grant (true)
 * - Other AskResponse types → extract value per AskApi contract
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
    
    // For dangerous operator commands, force 'once' scope (not persisted)
    const metadata = permAsk.metadata as Record<string, unknown> | undefined;
    if (permAsk.resource === 'shell-command' && isDangerousOperatorCommand(metadata)) {
      grantScope = 'once';
    }
    
    // Compute duration for session grants (default: 30 minutes)
    const duration = resp.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);
    
    // Use 'exact' matcher for operator-bearing commands (precise grant matching)
    // Use 'shell-command' matcher for non-operator commands (command name matching)
    const useExactMatcher = metadata?.hasOperators === true;
    
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
        matcher: useExactMatcher ? 'exact' : ((permAsk.resource ?? 'file') === 'shell-command' ? 'shell-command' : 'exact'),
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
      // Extract resolution value per AskApi contract
      pending.resolve(extractResolutionValue(response));
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
      // Extract resolution value per AskApi contract
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

export function hasPendingAsk(toolCallId: string): boolean {
  if (pendingAsks.has(toolCallId)) return true;
  for (const key of pendingAsks.keys()) {
    if (key.startsWith(`${toolCallId}#`)) return true;
  }
  return false;
}

/**
 * Reject all pending asks for a session.
 * Called when a session is interrupted/cancelled to unblock any waiting tool executions.
 */
export function rejectPendingAsksBySession(sessionId: string, error?: Error): string[] {
  const rejectedAskIds: string[] = [];
  const interruptError = error ?? new Error('Session interrupted');

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
