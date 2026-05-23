export type Platform = 'electron' | 'web' | 'unknown';

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

  detectedPlatform = 'web';
  return detectedPlatform;
}

export function isElectron(): boolean {
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