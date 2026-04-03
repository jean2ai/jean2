/**
 * Shared types and constants for UI components
 */

/**
 * Panel dimension constraints
 * Used by resizable side panels (sessions, files, etc.)
 */
export const PANEL_MIN_WIDTH = 220;
export const PANEL_DEFAULT_WIDTH = 256;
export const PANEL_MAX_WIDTH = 512;

/**
 * Validates and clamps a panel width to valid bounds
 */
export function clampPanelWidth(width: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));
}

/**
 * Storage keys for panel state persistence
 */
export const PANEL_STORAGE_KEYS = {
  SESSIONS: 'jean2_sessions_panel_width',
  FILES: 'jean2_files_panel_width',
} as const;

/**
 * Saved panel state shape
 */
export interface SavedPanelWidth {
  width: number;
}
