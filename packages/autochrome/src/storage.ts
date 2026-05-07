import { STORAGE_KEYS } from './types';

export function getOrCreateClientId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CLIENT_ID, (result) => {
      const existing = result[STORAGE_KEYS.CLIENT_ID] as string | undefined;
      if (existing) {
        resolve(existing);
        return;
      }

      const newId = crypto.randomUUID();
      chrome.storage.local.set({ [STORAGE_KEYS.CLIENT_ID]: newId }, () => {
        resolve(newId);
      });
    });
  });
}
