import { platform } from '@/platform';

export type Platform = 'electron' | 'web' | 'unknown';

/**
 * Returns the runtime platform category.
 *
 * VSCode webviews are categorized as 'web' because they share the same
 * browser runtime constraints (no native modules, no Electron APIs).
 * Use `platform.id` directly if you need to distinguish VSCode from browser,
 * or use `hasCapability()` for feature detection.
 */
export function getPlatform(): Platform {
  if (platform.id === 'electron') return 'electron';
  if (platform.id === 'vscode') return 'web';
  if (platform.id === 'web') return 'web';
  return 'unknown';
}

export function isElectron(): boolean {
  return platform.id === 'electron';
}

export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Win/i.test(navigator.platform || navigator.userAgent);
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}
