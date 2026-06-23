import { create } from 'zustand';
import type { PermissionRiskLevel } from '@jean2/sdk';
import type { UseBoundStore, StoreApi } from 'zustand';

// --- Configuration Section (deep-linking) ---
export type ConfigurationSection =
  // Preferences
  | 'account'
  | 'appearance'
  | 'keybinds'
  // Server
  | 'providers'
  | 'oauth'
  | 'models'
  | 'prompts'
  | 'preconfigs'
  | 'response-formats'
  | 'env';

interface ConfigurationSectionState {
  configurationSection: ConfigurationSection;
}

interface ConfigurationSectionActions {
  setConfigurationSection: (section: ConfigurationSection) => void;
}

// --- Dialogs ---
interface DialogState {
  showSettings: boolean;
  showConfiguration: boolean;
  showTools: boolean;
  showMCPDialog: boolean;
  showWorkspacePermissions: boolean;
}

interface DialogActions {
  setShowSettings: (show: boolean) => void;
  setShowConfiguration: (show: boolean) => void;
  setShowTools: (show: boolean) => void;
  setShowMCPDialog: (show: boolean) => void;
  setShowWorkspacePermissions: (show: boolean) => void;
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
const EXPANDED_TOOLBAR_KEY = 'jean2_expanded_toolbar';

const getStoredBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored !== null ? stored === 'true' : fallback;
};

interface SettingsState {
  chatFinishSoundEnabled: boolean;
  permissionSoundEnabled: boolean;
  expandedToolbar: boolean;
}

interface SettingsActions {
  setChatFinishSoundEnabled: (enabled: boolean) => void;
  setPermissionSoundEnabled: (enabled: boolean) => void;
  setExpandedToolbar: (expanded: boolean) => void;
}

// --- Auto-Approve Severity ---
const AUTO_APPROVE_KEY = 'jean2_auto_approve_severity';

function loadAutoApproveMap(): Record<string, PermissionRiskLevel | 'off'> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(AUTO_APPROVE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function persistAutoApproveMap(map: Record<string, PermissionRiskLevel | 'off'>): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTO_APPROVE_KEY, JSON.stringify(map));
  }
}

interface AutoApproveState {
  autoApproveBySession: Record<string, PermissionRiskLevel | 'off'>;
}

interface AutoApproveActions {
  setAutoApproveMaxSeverity: (sessionId: string, level: PermissionRiskLevel | 'off') => void;
  getAutoApproveMaxSeverity: (sessionId: string) => PermissionRiskLevel | 'off' | null;
}

// --- Combined Store ---
type UIStore = DialogState & DialogActions & ConfigurationSectionState & ConfigurationSectionActions & SettingsState & SettingsActions & FilePreviewState & FilePreviewActions & AutoApproveState & AutoApproveActions;

export const useUIStore: UseBoundStore<StoreApi<UIStore>> = create<UIStore>((set) => ({
  // --- Dialogs ---
  showSettings: false,
  showConfiguration: false,
  showTools: false,
  showMCPDialog: false,
  showWorkspacePermissions: false,

  // Open the unified settings dialog (preference or server section)
  setShowSettings: (show: boolean) => set({ showConfiguration: show, showSettings: show }),
  setShowConfiguration: (show) => set({ showConfiguration: show }),
  setShowTools: (show) => set({ showTools: show }),
  setShowMCPDialog: (show) => set({ showMCPDialog: show }),
  setShowWorkspacePermissions: (show) => set({ showWorkspacePermissions: show }),

  // --- Configuration Section ---
  configurationSection: 'providers',
  setConfigurationSection: (section) => set({ configurationSection: section }),

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

  // --- Toolbar ---
  expandedToolbar: getStoredBoolean(EXPANDED_TOOLBAR_KEY, false),

  setExpandedToolbar: (expanded) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(EXPANDED_TOOLBAR_KEY, String(expanded));
    }
    set({ expandedToolbar: expanded });
  },

  // --- File Preview ---
  filePreviewTarget: null,

  openFilePreview: (target) => set({ filePreviewTarget: target }),
  closeFilePreview: () => set({ filePreviewTarget: null }),

  // --- Auto-Approve Severity ---
  autoApproveBySession: loadAutoApproveMap(),

  setAutoApproveMaxSeverity: (sessionId, level) =>
    set((state) => {
      const next = { ...state.autoApproveBySession };
      next[sessionId] = level;
      persistAutoApproveMap(next);
      return { autoApproveBySession: next };
    }),

  getAutoApproveMaxSeverity: (sessionId): PermissionRiskLevel | 'off' | null => {
    return useUIStore.getState().autoApproveBySession[sessionId] ?? null;
  },
}));
