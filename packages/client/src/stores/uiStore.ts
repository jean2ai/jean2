import { create } from 'zustand';
import type { SavedServer } from '@jean2/sdk';
import {
  PANEL_DEFAULT_WIDTH,
  clampPanelWidth,
} from '@jean2/sdk';
import {
  getSessionsPanelWidth,
  saveSessionsPanelWidth,
  getFilesPanelWidth,
  saveFilesPanelWidth,
} from '@/config/panelStorage';

export type CompletionRecord = {
  type: 'flash-only' | 'flash-then-sticky';
  flashStartedAt: number;
};

const FLASH_DURATION_MS = 5000;

export type SidebarViewMode = 'default' | 'overview';

export interface FilePreviewTarget {
  workspaceId: string;
  path: string;
  name: string;
}

interface UIState {
  showSettings: boolean;
  showConfiguration: boolean;
  showMCPDialog: boolean;
  showFilesPanel: boolean;
  showTerminalPanel: boolean;
  showWorkspacePermissions: boolean;
  showAddServer: boolean;
  editServerData: SavedServer | null;
  sidebarViewMode: SidebarViewMode;
  completionState: Map<string, CompletionRecord>;
  sessionsPanelWidth: number;
  filesPanelWidth: number;
  filePreviewTarget: FilePreviewTarget | null;
}

interface UIActions {
  setShowSettings: (show: boolean) => void;
  setShowConfiguration: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowFilesPanel: (show: boolean) => void;
  setShowTerminalPanel: (show: boolean) => void;
  setShowWorkspacePermissions: (show: boolean) => void;
  setShowAddServer: (show: boolean) => void;
  setEditServerData: (data: SavedServer | null) => void;
  setSidebarViewMode: (mode: SidebarViewMode) => void;
  setCompletion: (sessionId: string, record: CompletionRecord) => void;
  clearCompletion: (sessionId: string) => void;
  clearAllCompletions: () => void;
  setSessionsPanelWidth: (width: number) => void;
  setFilesPanelWidth: (width: number) => void;
  openFilePreview: (target: FilePreviewTarget) => void;
  closeFilePreview: () => void;
}

type UIStore = UIState & UIActions;

const SIDEBAR_VIEW_STORAGE_KEY = 'jean2_sidebar_view';

const getInitialSidebarViewMode = (): SidebarViewMode => {
  if (typeof window === 'undefined') return 'default';
  const stored = localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
  return stored === 'default' || stored === 'overview' ? stored : 'default';
};

const getInitialSessionsPanelWidth = (): number => {
  return getSessionsPanelWidth(PANEL_DEFAULT_WIDTH);
};

const getInitialFilesPanelWidth = (): number => {
  return getFilesPanelWidth(PANEL_DEFAULT_WIDTH);
};

export const useUIStore = create<UIStore>((set) => ({
  showSettings: false,
  showConfiguration: false,
  showMCPDialog: false,
  showFilesPanel: false,
  showTerminalPanel: false,
  showWorkspacePermissions: false,
  showAddServer: false,
  editServerData: null,
  sidebarViewMode: getInitialSidebarViewMode(),
  completionState: new Map<string, CompletionRecord>(),
  sessionsPanelWidth: getInitialSessionsPanelWidth(),
  filesPanelWidth: getInitialFilesPanelWidth(),
  filePreviewTarget: null,

  setShowSettings: (show) => set({ showSettings: show }),
  setShowConfiguration: (show) => set({ showConfiguration: show }),
  setShowMCPDialog: (show) => set({ showMCPDialog: show }),
  setShowFilesPanel: (show) => set({ showFilesPanel: show }),
  setShowTerminalPanel: (show) => set({ showTerminalPanel: show }),
  setShowWorkspacePermissions: (show) => set({ showWorkspacePermissions: show }),
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
  setSessionsPanelWidth: (width) => {
    const clampedWidth = clampPanelWidth(width);
    saveSessionsPanelWidth(clampedWidth);
    set({ sessionsPanelWidth: clampedWidth });
  },
  setFilesPanelWidth: (width) => {
    const clampedWidth = clampPanelWidth(width);
    saveFilesPanelWidth(clampedWidth);
    set({ filesPanelWidth: clampedWidth });
  },
  openFilePreview: (target) => set({ filePreviewTarget: target }),
  closeFilePreview: () => set({ filePreviewTarget: null }),
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
