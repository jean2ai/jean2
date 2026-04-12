import { create } from 'zustand';
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

export type SidebarViewMode = 'default' | 'overview';

interface ChatLayoutState {
  showFilesPanel: boolean;
  showTerminalPanel: boolean;
  sidebarViewMode: SidebarViewMode;
  sessionsPanelWidth: number;
  filesPanelWidth: number;
}

interface ChatLayoutActions {
  setShowFilesPanel: (show: boolean) => void;
  setShowTerminalPanel: (show: boolean) => void;
  setSidebarViewMode: (mode: SidebarViewMode) => void;
  setSessionsPanelWidth: (width: number) => void;
  setFilesPanelWidth: (width: number) => void;
}

type ChatLayoutStore = ChatLayoutState & ChatLayoutActions;

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

export const useChatLayoutStore = create<ChatLayoutStore>((set) => ({
  showFilesPanel: false,
  showTerminalPanel: false,
  sidebarViewMode: getInitialSidebarViewMode(),
  sessionsPanelWidth: getInitialSessionsPanelWidth(),
  filesPanelWidth: getInitialFilesPanelWidth(),

  setShowFilesPanel: (show) => set({ showFilesPanel: show }),
  setShowTerminalPanel: (show) => set({ showTerminalPanel: show }),
  setSidebarViewMode: (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, mode);
    }
    set({ sidebarViewMode: mode });
  },
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
}));
