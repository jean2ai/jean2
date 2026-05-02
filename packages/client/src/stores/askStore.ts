import { create } from 'zustand';
import type { Ask, AskTarget, AskResponse } from '@jean2/sdk';

export interface PendingAskRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  ask: Ask;
  originSessionId?: string;
  /** Canonical request identity for permission asks (correlates with server DB) */
  requestId?: string;
}

// Handler type: receives the ask, returns AskResponse or undefined (to fall through to UI)
export type AskHandler = (request: PendingAskRequest) => AskResponse | undefined | Promise<AskResponse | undefined>;

interface AskState {
  pendingRequests: PendingAskRequest[];
  handlers: Map<string, AskHandler[]>;
}

interface AskActions {
  addPendingRequest: (request: PendingAskRequest) => void;
  removePendingRequest: (toolCallId: string) => void;
  /** Remove a permission request by its canonical requestId. Falls back to toolCallId for legacy asks. */
  removePendingPermissionRequest: (requestId: string, toolCallId?: string) => void;
  /** Replace all pending permission requests with an authoritative set from the server. */
  replacePendingPermissionRequests: (requests: PendingAskRequest[]) => void;
  clearPendingRequests: () => void;
  clearPendingRequestsBySessionId: (sessionId: string) => void;
  registerHandler: (target: AskTarget, handler: AskHandler) => void;
  unregisterHandler: (target: AskTarget, handler: AskHandler) => void;
  getHandlers: (target: AskTarget) => AskHandler[];
}

type AskStore = AskState & AskActions;

export const useAskStore = create<AskStore>((set, get) => ({
  pendingRequests: [],
  handlers: new Map(),

  addPendingRequest: (request) =>
    set((state) => {
      // For permission asks, deduplicate by requestId (canonical identity)
      // For generic asks, deduplicate by toolCallId (legacy behavior)
      const isPermission = request.ask.type === 'permission';
      const filtered = isPermission && request.requestId
        ? state.pendingRequests.filter(
            (r) => !(r.ask.type === 'permission' && r.requestId === request.requestId),
          )
        : state.pendingRequests.filter((r) => r.toolCallId !== request.toolCallId);

      return {
        pendingRequests: [...filtered, request],
      };
    }),

  removePendingRequest: (toolCallId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.toolCallId !== toolCallId),
    })),

  removePendingPermissionRequest: (requestId, toolCallId) =>
    set((state) => {
      // Try to find by requestId first (canonical for permission asks)
      const byRequestId = state.pendingRequests.findIndex(
        (r) => r.ask.type === 'permission' && r.requestId === requestId,
      );
      if (byRequestId !== -1) {
        return {
          pendingRequests: state.pendingRequests.filter((_, i) => i !== byRequestId),
        };
      }
      // Fallback to toolCallId for legacy/compat
      if (toolCallId) {
        return {
          pendingRequests: state.pendingRequests.filter((r) => r.toolCallId !== toolCallId),
        };
      }
      return state;
    }),

  replacePendingPermissionRequests: (requests) =>
    set((state) => {
      // Keep only non-permission pending requests, then add the new permission set
      const nonPermission = state.pendingRequests.filter((r) => r.ask.type !== 'permission');
      return {
        pendingRequests: [...nonPermission, ...requests],
      };
    }),

  clearPendingRequests: () => set({ pendingRequests: [] }),

  clearPendingRequestsBySessionId: (sessionId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter(
        (r) => r.sessionId !== sessionId && r.originSessionId !== sessionId,
      ),
    })),

  registerHandler: (target, handler) => {
    set((state) => {
      const next = new Map(state.handlers);
      const existing = next.get(target) ?? [];
      next.set(target, [...existing, handler]);
      return { handlers: next };
    });
  },

  unregisterHandler: (target, handler) => {
    set((state) => {
      const next = new Map(state.handlers);
      const existing = next.get(target);
      if (existing) {
        next.set(target, existing.filter((h) => h !== handler));
      }
      return { handlers: next };
    });
  },

  getHandlers: (target) => {
    return get().handlers.get(target) ?? [];
  },
}));