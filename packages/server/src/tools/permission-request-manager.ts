import type {
  Ask,
  AskPermissionResponse,
  PermissionAsk,
  GrantScope,
  PermissionIntent,
  AskAuthority,
  PermissionRiskLevel,
} from '@jean2/sdk';
import {
  matchGrant,
  createGrantFromOptions,
} from '@/store/permissions';
import {
  createPendingAsk,
  resolvePermissionRequestByRequestId,
  expirePermissionRequest,
  expireOldPermissionRequests,
  cancelPendingRequestsBySession,
  getPermissionRequestByRequestId,
  listPendingRequestsByRootSession,
  type PendingAskRecord,
} from '@/store/pending-asks';
import {
  SHELL_DANGEROUS_COMMANDS,
  SHELL_FILESYSTEM_COMMANDS,
} from '@jean2/sdk';
import { getSession } from '@/store/sessions';
import { getPermissionTimeoutMs } from '@/env';
import { notifyPermissionRequired } from '@/services/web-push/dispatch';


// =============================================================================
// Permission Request Manager
//
// Manages the lifecycle of permission requests using DB-backed state.
// This module is the single authority for:
// - Checking existing grants (auto-approve)
// - Creating permission request records
// - Resolving by requestId
// - Expiring timed-out requests
// - Cancelling on session interrupt/close
// - Persisting grants on approval
// =============================================================================

// In-memory waiters keyed by requestId
interface PermissionWaiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  createdAt: number;
  sessionId: string;
  toolCallId: string;
  broadcastFn: PermissionBroadcastFn;
}

const waiters = new Map<string, PermissionWaiter>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const PERMISSION_TIMEOUT = getPermissionTimeoutMs();

const DEFAULT_ASK_AUTHORITY: AskAuthority = {
  visibilityScope: 'controller_only',
  resolutionMode: 'controller_only',
};

// =============================================================================
// Broadcast type — same as ask-user-api
// =============================================================================

export type PermissionBroadcastFn = (message: unknown) => void;

// =============================================================================
// Server-side auto-approve helpers
// =============================================================================

const RISK_ORDER: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

function isRiskAtOrBelow(risk: PermissionRiskLevel, max: PermissionRiskLevel): boolean {
  return RISK_ORDER.indexOf(risk) <= RISK_ORDER.indexOf(max);
}

function tryServerAutoApprove(
  sessionId: string,
  ask: Ask,
): boolean {
  const isPermissionAsk = ask.type === 'permission';
  if (!isPermissionAsk) return false;

  const permAsk = ask as PermissionAsk;
  const risk = permAsk.risk;
  if (!risk) return false;

  const session = getSession(sessionId);
  const maxSeverity = session?.autoApproveSeverity;
  if (!maxSeverity || maxSeverity === 'off') return false;

  if (!isRiskAtOrBelow(risk, maxSeverity)) return false;

  console.log(
    `[permissions] Server auto-approve: risk=${risk} maxSeverity=${maxSeverity} session=${sessionId}`,
  );

  return true;
}

// =============================================================================
// Helpers
// =============================================================================

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

  const dangerous = SHELL_DANGEROUS_COMMANDS.some(
    (command) => lower === command || lower.startsWith(command + ' '),
  );
  if (dangerous) return true;

  return SHELL_FILESYSTEM_COMMANDS.some(
    (command) => lower === command || lower.startsWith(command + ' '),
  );
}

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

function isGrantedResponse(response: unknown): boolean | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const r = response as Record<string, unknown>;
  if (r.type !== 'permission') return undefined;
  const permResp = response as AskPermissionResponse;
  return permResp.grant !== 'deny';
}

// =============================================================================
// Core: Request Permission
// =============================================================================

export interface RequestPermissionParams {
  sessionId: string;
  rootSessionId?: string;
  workspaceId?: string;
  toolCallId: string;
  toolName: string;
  ask: Ask;
  broadcastFn: PermissionBroadcastFn;
  timeoutMs?: number;
}

/**
 * Request permission from the user.
 *
 * 1. Checks existing grants for auto-approve
 * 2. Creates a DB record in 'pending' state
 * 3. Registers an in-memory waiter
 * 4. Broadcasts ask.request to clients
 * 5. Returns a promise that resolves on user response or timeout
 */
export async function requestPermission(params: RequestPermissionParams): Promise<unknown> {
  const {
    sessionId,
    rootSessionId,
    workspaceId,
    toolCallId,
    toolName,
    ask,
    broadcastFn,
    timeoutMs = PERMISSION_TIMEOUT,
  } = params;

  const isPermissionAsk = ask.type === 'permission';

  // Auto-approve: check existing grants for permission asks
  if (isPermissionAsk && workspaceId) {
    const permAsk = ask as PermissionAsk;

    // Derive root session ID for session-scoped grant matching
    const effectiveRootSessionId = rootSessionId ?? sessionId;

    // Phase 3: Use intent-based matching when intents are available
    if (permAsk.intents && permAsk.intents.length > 0) {
      for (const intent of permAsk.intents) {
        for (const target of intent.targets) {
          const matchResult = matchGrant({
            workspaceId,
            toolName,
            resource: intent.resource,
            action: intent.action,
            permissionKey: target.target,
            rootSessionId: effectiveRootSessionId,
          });
          if (matchResult.matched) {
            return true;
          }
        }
      }
    }

    // Fallback: legacy matching when no intents
    const permissionKey = buildPermissionKey(
      toolName,
      permAsk.resource ?? 'file',
      permAsk.patterns,
    );

    const matchResult = matchGrant({
      workspaceId,
      toolName,
      resource: permAsk.resource ?? 'file',
      permissionKey,
      rootSessionId: effectiveRootSessionId,
    });

    if (matchResult.matched) {
      return true;
    }
  }

  // Server-side auto-approve: if session has autoApproveSeverity configured
  // and no client is connected, auto-approve with 'once' scope
  if (tryServerAutoApprove(sessionId, ask)) {
    return true;
  }

  // Generate a unique requestId
  const requestId = crypto.randomUUID();
  const now = Date.now();

  // Create DB record
  createPendingAsk({
    sessionId,
    rootSessionId,
    workspaceId,
    toolCallId,
    toolName,
    ask,
    requestId,
    status: 'pending',
    isPermission: isPermissionAsk,
    expiresAt: now + timeoutMs,
    createdAt: now,
  });

  // Trigger web push notification for permission requests.
  // Only for permission asks, not generic questions. Uses rootSessionId for
  // routing so the notification opens the top-level session.
  if (isPermissionAsk) {
    const effectiveRoot = rootSessionId ?? sessionId;
    notifyPermissionRequired(requestId, effectiveRoot);
  }

  // Broadcast ask.request with requestId
  broadcastFn({
    type: 'ask.request',
    sessionId,
    toolCallId,
    toolName,
    ask,
    requestId,
    authority: DEFAULT_ASK_AUTHORITY,
  });

  // Return a promise that will be resolved by resolvePermission or timeout
  return new Promise<unknown>((resolve, reject) => {
    waiters.set(requestId, {
      resolve,
      reject,
      createdAt: now,
      sessionId,
      toolCallId,
      broadcastFn,
    });

    const timerId = setTimeout(() => {
      if (waiters.has(requestId)) {
        waiters.delete(requestId);
        timers.delete(requestId);

        // Mark as expired in DB
        expirePermissionRequestByRequestId(requestId);

        broadcastFn({
          type: 'ask.timeout',
          sessionId,
          toolCallId,
          requestId,
        });

        reject(new Error('User did not respond in time'));
      }
    }, timeoutMs);

    timers.set(requestId, timerId);
  });
}

// =============================================================================
// Core: Resolve Permission
// =============================================================================

/**
 * Resolve a permission request by requestId.
 *
 * 1. Checks if the request is still pending in DB
 * 2. Updates DB status to approved/denied
 * 3. Persists grant if approved with a persistable scope
 * 4. Wakes the in-memory waiter
 *
 * Returns true if the request was found and resolved.
 * Returns false if the request was not found, already resolved, expired, or cancelled.
 */
export function resolvePermission(
  requestId: string,
  response: unknown,
): boolean {
  // Check if we have an in-memory waiter for this requestId
  const waiter = waiters.get(requestId);
  if (!waiter) {
    // No waiter — but the request might still exist in DB as pending
    // (e.g., client responded after server restart or reconnect)
    // Try to resolve in DB anyway for audit trail
    const record = getPermissionRequestByRequestId(requestId);
    if (record && record.status === 'pending') {
      const status = isPermissionApproved(response) ? 'approved' as const : 'denied' as const;
      resolvePermissionRequestByRequestId(requestId, status, response as AskPermissionResponse | undefined);
    }
    return false;
  }

  // Clear timer
  clearTimer(requestId);

  // Load DB record to get context for grant persistence
  const record = getPermissionRequestByRequestId(requestId);

  // Persist decision to DB first
  if (record && record.status === 'pending') {
    const isApproved = isPermissionApproved(response);
    const status = isApproved ? 'approved' as const : 'denied' as const;
    resolvePermissionRequestByRequestId(requestId, status, response as AskPermissionResponse | undefined);

    // Persist grant if approved and it's a permission ask
    if (isApproved && record.isPermission) {
      persistGrant(response as AskPermissionResponse, record);
    }
  }

  // Resolve the waiter
  const granted = isGrantedResponse(response);
  if (granted !== undefined && record?.isPermission) {
    waiter.resolve(granted);
  } else {
    waiter.resolve(extractResolutionValue(response));
  }

  waiters.delete(requestId);
  return true;
}

// =============================================================================
// Core: Reject Permission (error/interrupt)
// =============================================================================

/**
 * Reject a permission request by requestId.
 * Used for server-side errors or abort scenarios.
 */
export function rejectPermission(requestId: string, error: Error): boolean {
  const waiter = waiters.get(requestId);
  if (!waiter) return false;

  clearTimer(requestId);
  waiter.reject(error);
  waiters.delete(requestId);
  return true;
}

/**
 * Reject all pending permission requests for a specific toolCallId.
 * Used when a tool execution ends (timeout/error/completion) to clean up
 * any lingering permission asks the tool was waiting on.
 *
 * Broadcasts ask.timeout for each rejected waiter so the client removes the UI prompt.
 * Returns list of rejected requestIds.
 */
export function rejectPermissionsByToolCallId(toolCallId: string, error?: Error): string[] {
  const rejectedIds: string[] = [];
  const timeoutError = error ?? new Error('Tool execution ended');

  for (const [requestId, waiter] of waiters) {
    if (waiter.toolCallId === toolCallId) {
      clearTimer(requestId);
      // Mark as expired in DB
      expirePermissionRequestByRequestId(requestId);
      // Broadcast ask.timeout so the client removes the permission prompt
      waiter.broadcastFn({
        type: 'ask.timeout',
        sessionId: waiter.sessionId,
        toolCallId: waiter.toolCallId,
        requestId,
      });
      waiter.reject(timeoutError);
      waiters.delete(requestId);
      rejectedIds.push(requestId);
    }
  }

  return rejectedIds;
}

/**
 * Reject all pending permission requests for a session.
 * Used on session interrupt/close.
 *
 * Updates DB state to 'cancelled' for all pending requests.
 * Returns list of rejected requestIds.
 */
export function rejectPermissionsBySession(sessionId: string, error?: Error): string[] {
  const rejectedIds: string[] = [];
  const interruptError = error ?? new Error('Session interrupted');

  // Cancel all pending DB records for this session
  cancelPendingRequestsBySession(sessionId);

  // Reject in-memory waiters and broadcast ask.timeout to client
  for (const [requestId, waiter] of waiters) {
    // We need to find which waiters belong to this session
    // Check the DB record
    const record = getPermissionRequestByRequestId(requestId);
    if (record && record.sessionId === sessionId) {
      clearTimer(requestId);
      // Broadcast ask.timeout so the client removes the permission prompt from the UI.
      // Use the original sessionId from the waiter — the broadcastFn (e.g. askBroadcastFn
      // in child-session.ts) will rewrite it to the root session ID if needed.
      waiter.broadcastFn({
        type: 'ask.timeout',
        sessionId: waiter.sessionId,
        toolCallId: waiter.toolCallId,
        requestId,
      });
      waiter.reject(interruptError);
      waiters.delete(requestId);
      rejectedIds.push(requestId);
    }
  }

  return rejectedIds;
}

// =============================================================================
// Core: Get Pending Requests (for reconnect)
// =============================================================================

/**
 * Get all pending permission requests for a root session (and descendants).
 * Used on reconnect to re-send pending asks to the client.
 */
export function getPendingRequestsByRootSession(rootSessionId: string): PendingAskRecord[] {
  return listPendingRequestsByRootSession(rootSessionId);
}

// =============================================================================
// Core: Expire Old Requests (periodic cleanup)
// =============================================================================

/**
 * Expire all permission requests older than maxAgeMs.
 * Also cleans up any in-memory waiters for those requests.
 */
export function expireOldRequests(maxAgeMs: number): number {
  const count = expireOldPermissionRequests(maxAgeMs);

  // Clean up any in-memory waiters that might be lingering
  const cutoff = Date.now() - maxAgeMs;
  for (const [requestId, waiter] of waiters) {
    if (waiter.createdAt < cutoff) {
      clearTimer(requestId);
      waiter.reject(new Error('Permission request expired'));
      waiters.delete(requestId);
    }
  }

  return count;
}

// =============================================================================
// Grant Persistence
// =============================================================================

function persistGrant(response: AskPermissionResponse, record: PendingAskRecord): void {
  if (!record.workspaceId || response.grant === 'deny') return;

  const permAsk = record.ask as PermissionAsk;
  let grantScope: GrantScope = response.grant;

  // Derive the bound root session ID for session-scoped grants
  const boundRootSessionId = record.rootSessionId ?? record.sessionId;

  // Phase 3: Use intent-based grant persistence when intents are available
  if (permAsk.intents && permAsk.intents.length > 0) {
    const intent: PermissionIntent = permAsk.intents[0];

    // Enforce scope policy: allowedScopes is the canonical source of truth.
    // If the user's chosen scope is not in the intent's allowedScopes, reject it.
    if (!intent.allowedScopes.includes(grantScope)) {
      return;
    }

    // Don't persist 'once' scope
    if (grantScope === 'once') return;

    const duration = response.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);

    // Create a grant per target with the correct matcher
    for (const target of intent.targets) {
      const matcher = target.matcher === 'prefix' ? 'prefix' : 'exact';

      createGrantFromOptions({
        workspaceId: record.workspaceId,
        toolName: record.toolName,
        resource: intent.resource,
        action: intent.action,
        permissionKey: target.target,
        grantOptions: {
          scope: grantScope,
          matcher,
          patterns: [target.target],
          action: intent.action,
          duration: grantScope === 'session' ? duration : undefined,
          description: permAsk.question,
          boundRootSessionId: grantScope === 'session' ? boundRootSessionId : undefined,
        },
      });
    }
    return;
  }

  // Legacy path: when no intents are present
  const metadata = permAsk.metadata as Record<string, unknown> | undefined;
  const identity = typeof metadata?.baseCommand === 'string' ? metadata.baseCommand : undefined;

  // Downgrade dangerous shell commands to once
  if (permAsk.resource === 'shell-command' && isDangerousShellIdentity(identity)) {
    grantScope = 'once';
  }

  const duration = response.duration || (grantScope === 'session' ? 30 * 60 * 1000 : undefined);

  createGrantFromOptions({
    workspaceId: record.workspaceId,
    toolName: record.toolName,
    resource: permAsk.resource ?? 'file',
    action: permAsk.action,
    permissionKey: buildPermissionKey(
      record.toolName,
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
      boundRootSessionId: grantScope === 'session' ? boundRootSessionId : undefined,
    },
  });
}

// =============================================================================
// Helpers: Private
// =============================================================================

function isPermissionApproved(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const r = response as Record<string, unknown>;
  if (r.type !== 'permission') return false;
  return (response as AskPermissionResponse).grant !== 'deny';
}

function clearTimer(requestId: string): void {
  const timer = timers.get(requestId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(requestId);
  }
}

function expirePermissionRequestByRequestId(requestId: string): boolean {
  const record = getPermissionRequestByRequestId(requestId);
  if (!record || record.status !== 'pending') return false;
  return expirePermissionRequest(record.id);
}

// =============================================================================
// Exports for testing / external use
// =============================================================================

export function hasPendingWaiter(requestId: string): boolean {
  return waiters.has(requestId);
}

export function getPendingWaiterCount(): number {
  return waiters.size;
}
