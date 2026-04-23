import { create } from 'zustand';
import type { SavedServer } from '@jean2/sdk';

// --- Dialogs ---
interface DialogState {
  showSettings: boolean;
  showConfiguration: boolean;
  showTools: boolean;
  showMCPDialog: boolean;
  showWorkspacePermissions: boolean;
  showAddServer: boolean;
  editServerData: SavedServer | null;
}

interface DialogActions {
  setShowSettings: (show: boolean) => void;
  setShowConfiguration: (show: boolean) => void;
  setShowTools: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowWorkspacePermissions: (show: boolean) => void;
  setShowAddServer: (show: boolean) => void;
  setEditServerData: (data: SavedServer | null) => void;
}

// --- File Preview ---
export interface FilePreviewTarget {
  workspaceId: string;
  path: string;
  name: string;
}

interface FilePreviewState {
  filePreviewTarget: FilePreviewTarget | null;
}

interface FilePreviewActions {
  openFilePreview: (target: FilePreviewTarget) => void;
  closeFilePreview: () => void;
}

// --- Settings ---
const CHAT_FINISH_SOUND_KEY = 'jean2_sound_chat_finish_enabled';
const PERMISSION_SOUND_KEY = 'jean2_sound_permission_enabled';

const getStoredBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : fallback;
};

interface SettingsState {
  chatFinishSoundEnabled: boolean;
  permissionSoundEnabled: boolean;
}

interface SettingsActions {
  setChatFinishSoundEnabled: (enabled: boolean) => void;
  setPermissionSoundEnabled: (enabled: boolean) => void;
}

// --- Combined Store ---
type UIStore = DialogState & DialogActions & SettingsState & SettingsActions & FilePreviewState & FilePreviewActions;

export const useUIStore = create<UIStore>((set) => ({
  // --- Dialogs ---
  showSettings: false,
  showConfiguration: false,
  showTools: false,
  showMCPDialog: false,
  showWorkspacePermissions: false,
  showAddServer: false,
  editServerData: null,

  setShowSettings: (show) => set({ showSettings: show }),
  setShowConfiguration: (show) => set({ showConfiguration: show }),
  setShowTools: (show) => set({ showTools: show }),
  setShowMCPDialog: (show) => set({ showMCPDialog: show }),
  setShowWorkspacePermissions: (show) => set({ showWorkspacePermissions: show }),
  setShowAddServer: (show) => set({ showAddServer: show }),
  setEditServerData: (data) => set({ editServerData: data }),

  // --- Settings ---
  chatFinishSoundEnabled: getStoredBoolean(CHAT_FINISH_SOUND_KEY, true),
  permissionSoundEnabled: getStoredBoolean(PERMISSION_SOUND_KEY, true),

  setChatFinishSoundEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHAT_FINISH_SOUND_KEY, String(enabled));
    }
    set({ chatFinishSoundEnabled: enabled });
  },
  setPermissionSoundEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PERMISSION_SOUND_KEY, String(enabled));
    }
    set({ permissionSoundEnabled: enabled });
  },

  // --- File Preview ---
  filePreviewTarget: null,

  openFilePreview: (target) => set({ filePreviewTarget: target }),
  closeFilePreview: () => set({ filePreviewTarget: null }),
}));
