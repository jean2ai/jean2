import type { ExtensionConfig } from './types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from './types';

export function getConfig(): Promise<ExtensionConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
      resolve(result[STORAGE_KEYS.CONFIG] ?? { ...DEFAULT_CONFIG });
    });
  });
}

export function setConfig(config: Partial<ExtensionConfig>): Promise<void> {
  return getConfig().then((current) => {
    const updated = { ...current, ...config };
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: updated }, () => resolve());
    });
  });
}

export function getServerUrl(): Promise<string> {
  return getConfig().then((c) => c.serverUrl);
}

export function getToken(): Promise<string | undefined> {
  return getConfig().then((c) => c.token);
}
