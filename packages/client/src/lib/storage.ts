import { isElectron, isTauriMobile } from '@/lib/platform';

let tauriStore: { get: <T>(key: string) => Promise<T | undefined>; set: (key: string, value: unknown) => Promise<void>; delete: (key: string) => Promise<boolean>; clear: () => Promise<void>; save: () => Promise<void>; } | null = null;

async function getTauriStore() {
  if (tauriStore) return tauriStore;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    tauriStore = await Store.load('settings.json');
    return tauriStore;
  } catch (error) {
    console.error('Failed to initialize Tauri store:', error);
    return null;
  }
}

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

    if (isTauriMobile()) {
      const store = await getTauriStore();
      if (store) {
        const value = await store.get<T>(key);
        return value ?? null;
      }
    }

    return localStorageGet<T>(key);
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.set(key, value);
      return;
    }

    if (isTauriMobile()) {
      const store = await getTauriStore();
      if (store) {
        await store.set(key, value);
        await store.save();
        return;
      }
    }

    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.remove(key);
      return;
    }

    if (isTauriMobile()) {
      const store = await getTauriStore();
      if (store) {
        await store.delete(key);
        await store.save();
        return;
      }
    }

    localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (isElectron() && window.__JEAN2_ELECTRON__) {
      await window.__JEAN2_ELECTRON__.store.clear();
      return;
    }

    if (isTauriMobile()) {
      const store = await getTauriStore();
      if (store) {
        await store.clear();
        await store.save();
        return;
      }
    }

    localStorage.clear();
  },

  isNative(): boolean {
    return isElectron() || isTauriMobile();
  },
};

export const STORAGE_KEYS = {
  API_TOKEN: 'jean2_api_token',
  TOKEN_EXPIRY: 'jean2_token_expiry',
  SERVER_URL: 'jean2_server_url',
  THEME: 'jean2-theme',
  ACTIVE_WORKSPACE_ID: 'activeWorkspaceId',
} as const;
