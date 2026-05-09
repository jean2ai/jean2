export type Platform = 'electron' | 'tauri-mobile' | 'web' | 'unknown';

let detectedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (detectedPlatform) return detectedPlatform;

  if (typeof window === 'undefined') {
    detectedPlatform = 'unknown';
    return detectedPlatform;
  }

  if (window.__JEAN2_ELECTRON__) {
    detectedPlatform = 'electron';
    return detectedPlatform;
  }

  if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
    detectedPlatform = 'tauri-mobile';
    return detectedPlatform;
  }

  detectedPlatform = 'web';
  return detectedPlatform;
}

export function isElectron(): boolean {
  return getPlatform() === 'electron';
}

export function isTauriMobile(): boolean {
  return getPlatform() === 'tauri-mobile';
}

export function isNative(): boolean {
  const p = getPlatform();
  return p === 'electron' || p === 'tauri-mobile';
}

export function isMobile(): boolean {
  return getPlatform() === 'tauri-mobile';
}

export function supportsWebViewEmbedding(): boolean {
  return getPlatform() === 'electron';
}

export function supportsMultiWindow(): boolean {
  return getPlatform() === 'electron';
}

export function supportsSystemTray(): boolean {
  return getPlatform() === 'electron';
}

export function supportsMenuBar(): boolean {
  return getPlatform() === 'electron';
}

export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Win/i.test(navigator.platform || navigator.userAgent);
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}