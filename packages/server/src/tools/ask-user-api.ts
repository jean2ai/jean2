import type { Ask, AskApi, PermissionAsk, AskPermissionResponse, GrantScope } from '@jean2/sdk';
import type { AskRequestMessage, AskTimedOutMessage } from '@jean2/sdk';
import {
  SHELL_DANGEROUS_COMMANDS,
  SHELL_FILESYSTEM_COMMANDS,
} from '@jean2/sdk';
import {
  matchGrant,
  createGrantFromOptions,
} from '@/store/permissions';
import {
  createPendingAsk,
  removePendingAsksByToolCallId,
} from '@/store/pending-asks';

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
const ASK_TIMEOUT = 5 * 60 * 1000;
const askTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type AskBroadcastFn = (message: AskRequestMessage | AskTimedOutMessage) => void;

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

export function createAskApi(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  broadcastFn: AskBroadcastFn,
  workspaceId?: string,
): AskApi {
  let askCounter = 0;

  const ask = async (request: Ask): Promise<unknown> => {
    const isPermissionAsk = request.type === 'permission';

    if (isPermissionAsk && workspaceId) {
      const permAsk = request as PermissionAsk;

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
      });

      if (matchResult.matched) {
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

      createPendingAsk({
        sessionId,
        toolCallId,
        toolName,
        ask: request,
        createdAt: Date.now(),
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

export function resolveAsk(toolCallId: string, response: unknown): boolean {
  function isGranted(resp: unknown): boolean | undefined {
    if (!resp || typeof resp !== 'object') return undefined;
    const r = resp as Record<string, unknown>;
    if (r.type !== 'permission') return undefined;
    const permResp = resp as AskPermissionResponse;
    return permResp.grant !== 'deny';
  }

  function persistGrant(resp: AskPermissionResponse, request: Ask, wsId: string | undefined, pending: PendingAsk): void {
    if (!wsId || resp.grant === 'deny') return;

    const permAsk = request as PermissionAsk;
    let grantScope: GrantScope = resp.grant;
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

export { listPendingAsksBySession } from '@/store/pending-asks';
