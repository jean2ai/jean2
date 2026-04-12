import { create } from 'zustand';

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

interface PermissionState {
  pendingPermissions: PendingPermissionRequest[];
}

interface PermissionActions {
  clearPendingPermissions: () => void;
  setPendingPermissions: (permissions: PendingPermissionRequest[]) => void;
  mergePendingPermissions: (newPermissions: PendingPermissionRequest[]) => void;
  addPendingPermission: (permission: PendingPermissionRequest) => void;
  removePendingPermissionByToolCallId: (toolCallId: string) => void;
  removePendingPermissionsBySessionId: (sessionId: string) => void;
}

type PermissionStore = PermissionState & PermissionActions;

export const usePermissionStore = create<PermissionStore>((set) => ({
  pendingPermissions: [],

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
}));
