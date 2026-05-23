import { isElectron } from '@/lib/platform';

function localStorageGet<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      return window.__JEAN2_ELECTRON__.store.get<T>(key);
    }

    return localStorageGet<T>(key);
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.set(key, value);
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.remove(key);
      return;
    }

    localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.clear();
      return;
    }

    localStorage.clear();
  },

  isNative(): boolean {
    return isElectron();
  },
};

export const STORAGE_KEYS = {
  API_TOKEN: 'jean2_api_token',
  TOKEN_EXPIRY: 'jean2_token_expiry',
  SERVER_URL: 'jean2_server_url',
  THEME: 'jean2-theme',
  ACTIVE_WORKSPACE_ID: 'activeWorkspaceId',
  CLIENT_ID: 'jean2_client_id',
} as const;
