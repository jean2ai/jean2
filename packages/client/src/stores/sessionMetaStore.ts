import { create } from 'zustand';
import type { QueuedMessage } from '@jean2/sdk';

export interface PendingPermissionRequest {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: string;
  permissionKey?: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  childSessionId?: string;
  subagentName?: string;
}

interface SessionMetaState {
  pendingPermissions: PendingPermissionRequest[];
  queuedMessages: Record<string, QueuedMessage[]>;
}

interface SessionMetaActions {
  clearPendingPermissions: () => void;
  setPendingPermissions: (permissions: PendingPermissionRequest[]) => void;
  mergePendingPermissions: (newPermissions: PendingPermissionRequest[]) => void;
  addPendingPermission: (permission: PendingPermissionRequest) => void;
  removePendingPermissionByToolCallId: (toolCallId: string) => void;
  removePendingPermissionsBySessionId: (sessionId: string) => void;
  clearQueuedMessages: () => void;
  setQueuedMessagesForSession: (sessionId: string, messages: QueuedMessage[]) => void;
  addQueuedMessage: (sessionId: string, message: QueuedMessage) => void;
  removeQueuedMessageById: (sessionId: string, queueId: string) => void;
  removeQueuedMessagesByIds: (sessionId: string, queueIds: string[]) => void;
}

type SessionMetaStore = SessionMetaState & SessionMetaActions;

export const useSessionMetaStore = create<SessionMetaStore>((set) => ({
  pendingPermissions: [],
  queuedMessages: {},

  clearPendingPermissions: () => set({ pendingPermissions: [] }),

  setPendingPermissions: (permissions) => set({ pendingPermissions: permissions }),

  mergePendingPermissions: (newPermissions) =>
    set((state) => {
      const existingIds = new Set(state.pendingPermissions.map((p) => p.toolCallId));
      const filteredNew = newPermissions.filter((p) => !existingIds.has(p.toolCallId));
      return { pendingPermissions: [...state.pendingPermissions, ...filteredNew] };
    }),

  addPendingPermission: (permission) =>
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, permission],
    })),

  removePendingPermissionByToolCallId: (toolCallId) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.toolCallId !== toolCallId),
    })),

  removePendingPermissionsBySessionId: (sessionId) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.sessionId !== sessionId),
    })),

  clearQueuedMessages: () => set({ queuedMessages: {} }),

  setQueuedMessagesForSession: (sessionId, messages) =>
    set((state) => ({
      queuedMessages: { ...state.queuedMessages, [sessionId]: messages },
    })),

  addQueuedMessage: (sessionId, message) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: [...(state.queuedMessages[sessionId] || []), message],
      },
    })),

  removeQueuedMessageById: (sessionId, queueId) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => q.id !== queueId),
      },
    })),

  removeQueuedMessagesByIds: (sessionId, queueIds) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => !queueIds.includes(q.id)),
      },
    })),
}));
