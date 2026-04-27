import { create } from 'zustand';
import type { UserQuestion } from '@jean2/sdk';

export interface PendingAskUserRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  question: UserQuestion;
}

interface AskUserState {
  pendingRequests: PendingAskUserRequest[];
}

interface AskUserActions {
  addPendingRequest: (request: PendingAskUserRequest) => void;
  removePendingRequest: (toolCallId: string) => void;
  clearPendingRequests: () => void;
}

type AskUserStore = AskUserState & AskUserActions;

export const useAskUserStore = create<AskUserStore>((set) => ({
  pendingRequests: [],

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
}));