import { platform } from '@/platform';

export interface StorageEntry<T> {
  exists: boolean;
  value: T | null;
}

function localStorageGetEntry<T>(key: string): StorageEntry<T> {
  const item = localStorage.getItem(key);
  if (item === null) return { exists: false, value: null };

  try {
    return { exists: true, value: JSON.parse(item) as T };
  } catch {
    return { exists: true, value: null };
  }
}

function localStorageGet<T>(key: string): T | null {
  return localStorageGetEntry<T>(key).value;
}

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    if (platform.storage) {
      return platform.storage.get<T>(key);
    }
    return localStorageGet<T>(key);
  },

  async getEntry<T>(key: string): Promise<StorageEntry<T>> {
    if (platform.storage) {
      const value = await platform.storage.get<T>(key);
      return { exists: value !== null, value };
    }
    return localStorageGetEntry<T>(key);
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (platform.storage) {
      return platform.storage.set(key, value);
    }
    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    if (platform.storage) {
      return platform.storage.remove(key);
    }
    localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (platform.storage) {
      return platform.storage.clear();
    }
    localStorage.clear();
  },

  isNative(): boolean {
    return platform.capabilities.storage;
  },
};

export const STORAGE_KEYS = {
  API_TOKEN: 'jean2_api_token',
  TOKEN_EXPIRY: 'jean2_token_expiry',
  SERVER_URL: 'jean2_server_url',
  THEME: 'jean2-theme',
  ACTIVE_WORKSPACE_ID: 'activeWorkspaceId',
  CLIENT_ID: 'jean2_client_id',
  OVERVIEW_GROUPS: 'jean2_overview_groups',
} as const;
