import { create } from 'zustand';
import type { SavedServer } from '@jean2/shared';

export type SidebarViewMode = 'default' | 'overview';

interface UIState {
  showSettings: boolean;
  showMCPDialog: boolean;
  showFilesPanel: boolean;
  showTerminalPanel: boolean;
  showAddServer: boolean;
  editServerData: SavedServer | null;
  sidebarViewMode: SidebarViewMode;
}

interface UIActions {
  setShowSettings: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowFilesPanel: (show: boolean) => void;
  setShowTerminalPanel: (show: boolean) => void;
  setShowAddServer: (show: boolean) => void;
  setEditServerData: (data: SavedServer | null) => void;
  setSidebarViewMode: (mode: SidebarViewMode) => void;
}

type UIStore = UIState & UIActions;

const SIDEBAR_VIEW_STORAGE_KEY = 'jean2_sidebar_view';

const getInitialSidebarViewMode = (): SidebarViewMode => {
  if (typeof window === 'undefined') return 'default';
  const stored = localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
  return stored === 'default' || stored === 'overview' ? stored : 'default';
};

export const useUIStore = create<UIStore>((set) => ({
  showSettings: false,
  showMCPDialog: false,
  showFilesPanel: false,
  showTerminalPanel: false,
  showAddServer: false,
  editServerData: null,
  sidebarViewMode: getInitialSidebarViewMode(),

  setShowSettings: (show) => set({ showSettings: show }),
  setShowMCPDialog: (show) => set({ showMCPDialog: show }),
  setShowFilesPanel: (show) => set({ showFilesPanel: show }),
  setShowTerminalPanel: (show) => set({ showTerminalPanel: show }),
  setShowAddServer: (show) => set({ showAddServer: show }),
  setEditServerData: (data) => set({ editServerData: data }),
  setSidebarViewMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, mode);
    }
    set({ sidebarViewMode: mode });
  },
}));
