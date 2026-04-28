import { create } from 'zustand';
import type { Ask, AskTarget, AskResponse } from '@jean2/sdk';

export interface PendingAskRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  ask: Ask;
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
    set((state) => ({
      pendingRequests: [
        ...state.pendingRequests.filter((r) => r.toolCallId !== request.toolCallId),
        request,
      ],
    })),

  removePendingRequest: (toolCallId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.toolCallId !== toolCallId),
    })),

  clearPendingRequests: () => set({ pendingRequests: [] }),

  clearPendingRequestsBySessionId: (sessionId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.sessionId !== sessionId),
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