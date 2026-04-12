import { create } from 'zustand';
import type { SavedServer } from '@jean2/sdk';

interface DialogState {
  showSettings: boolean;
  showConfiguration: boolean;
  showMCPDialog: boolean;
  showWorkspacePermissions: boolean;
  showAddServer: boolean;
  editServerData: SavedServer | null;
}

interface DialogActions {
  setShowSettings: (show: boolean) => void;
  setShowConfiguration: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowWorkspacePermissions: (show: boolean) => void;
  setShowAddServer: (show: boolean) => void;
  setEditServerData: (data: SavedServer | null) => void;
}

type DialogStore = DialogState & DialogActions;

export const useDialogStore = create<DialogStore>((set) => ({
  showSettings: false,
  showConfiguration: false,
  showMCPDialog: false,
  showWorkspacePermissions: false,
  showAddServer: false,
  editServerData: null,

  setShowSettings: (show) => set({ showSettings: show }),
  setShowConfiguration: (show) => set({ showConfiguration: show }),
  setShowMCPDialog: (show) => set({ showMCPDialog: show }),
  setShowWorkspacePermissions: (show) => set({ showWorkspacePermissions: show }),
  setShowAddServer: (show) => set({ showAddServer: show }),
  setEditServerData: (data) => set({ editServerData: data }),
}));
