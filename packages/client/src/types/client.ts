/**
 * Client-specific types for UI state persistence
 */

// =============================================================================
// Server Connection Types
// =============================================================================

export interface SavedServer {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
  token?: string;
  createdAt: string;
  lastConnected?: string;
}

export interface QuickConnection {
  id: string;
  serverId: string;
  workspaceId?: string;
  serverName?: string;
  workspaceName?: string;
  name: string;
  order: number;
}

// =============================================================================
// Panel Storage Types
// =============================================================================

export interface SavedPanelWidth {
  width: number;
}

export const PANEL_STORAGE_KEYS = {
  SESSIONS: 'jean2_panel_sessions_width',
  FILES: 'jean2_panel_files_width',
} as const;

export const PANEL_MIN_WIDTH = 150;
export const PANEL_MAX_WIDTH = 600;
export const PANEL_DEFAULT_WIDTH = 280;

/**
 * Clamps a width value to valid panel bounds
 */
export function clampPanelWidth(width: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));
}

// =============================================================================
// Draft Storage Types
// =============================================================================

export const DRAFT_KEY_PREFIX = 'jean2_draft_';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SavedDraft {
  text: string;
  updatedAt: number;
}

/**
 * Remove expired drafts from storage
 */
export function cleanupExpiredDrafts(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_KEY_PREFIX)) {
      try {
        const draft = JSON.parse(localStorage.getItem(key) || '') as SavedDraft;
        if (now - draft.updatedAt > DRAFT_TTL_MS) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
