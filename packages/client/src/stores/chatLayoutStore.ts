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

interface ChatLayoutState {
  showFilesPanel: boolean;
  showTerminalPanel: boolean;
  sessionsPanelWidth: number;
  filesPanelWidth: number;
}

interface ChatLayoutActions {
  setShowFilesPanel: (show: boolean) => void;
  setShowTerminalPanel: (show: boolean) => void;
  setSessionsPanelWidth: (width: number) => void;
  setFilesPanelWidth: (width: number) => void;
}

type ChatLayoutStore = ChatLayoutState & ChatLayoutActions;

const getInitialSessionsPanelWidth = (): number => {
  return getSessionsPanelWidth(PANEL_DEFAULT_WIDTH);
};

const getInitialFilesPanelWidth = (): number => {
  return getFilesPanelWidth(PANEL_DEFAULT_WIDTH);
};

export const useChatLayoutStore = create<ChatLayoutStore>((set) => ({
  showFilesPanel: false,
  showTerminalPanel: false,
  sessionsPanelWidth: getInitialSessionsPanelWidth(),
  filesPanelWidth: getInitialFilesPanelWidth(),

  setShowFilesPanel: (show) => set({ showFilesPanel: show }),
  setShowTerminalPanel: (show) => set({ showTerminalPanel: show }),
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