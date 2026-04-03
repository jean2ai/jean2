import { create } from 'zustand';
import type { SavedServer } from '@jean2/shared';

export type CompletionRecord = {
  type: 'flash-only' | 'flash-then-sticky';
  flashStartedAt: number;
};

const FLASH_DURATION_MS = 5000;

export type SidebarViewMode = 'default' | 'overview';

interface UIState {
  showSettings: boolean;
  showMCPDialog: boolean;
  showFilesPanel: boolean;
  showTerminalPanel: boolean;
  showAddServer: boolean;
  editServerData: SavedServer | null;
  sidebarViewMode: SidebarViewMode;
  completionState: Map<string, CompletionRecord>;
}

interface UIActions {
  setShowSettings: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowFilesPanel: (show: boolean) => void;
  setShowTerminalPanel: (show: boolean) => void;
  setShowAddServer: (show: boolean) => void;
  setEditServerData: (data: SavedServer | null) => void;
  setSidebarViewMode: (mode: SidebarViewMode) => void;
  setCompletion: (sessionId: string, record: CompletionRecord) => void;
  clearCompletion: (sessionId: string) => void;
  clearAllCompletions: () => void;
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
  completionState: new Map<string, CompletionRecord>(),

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
  setCompletion: (sessionId, record) => set((state) => {
    const newMap = new Map(state.completionState);
    newMap.set(sessionId, record);
    return { completionState: newMap };
  }),
  clearCompletion: (sessionId) => set((state) => {
    const newMap = new Map(state.completionState);
    newMap.delete(sessionId);
    return { completionState: newMap };
  }),
  clearAllCompletions: () => set({ completionState: new Map<string, CompletionRecord>() }),
}));

// Selector: get completion record for a session
export const selectCompletionRecord = (sessionId: string) => (state: UIStore) =>
  state.completionState.get(sessionId);

// Selector: is session in flash phase (within flash duration)
export const selectIsFlashing = (sessionId: string) => (state: UIStore) => {
  const record = state.completionState.get(sessionId);
  if (!record) return false;
  return Date.now() - record.flashStartedAt < FLASH_DURATION_MS;
};

// Selector: is session in sticky phase (flash-then-sticky type)
export const selectIsSticky = (sessionId: string) => (state: UIStore) => {
  const record = state.completionState.get(sessionId);
  return record?.type === 'flash-then-sticky';
};

// Constants for consumers
export const COMPLETION_FLASH_DURATION_MS = FLASH_DURATION_MS;
