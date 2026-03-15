import { Store } from '@tauri-apps/plugin-store';

// Check if running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Store instance (lazy initialized)
let store: Store | null = null;

async function getStore(): Promise<Store | null> {
  if (!isTauri) return null;
  if (store) return store;
  
  try {
    store = await Store.load('settings.json');
    return store;
  } catch (error) {
    console.error('Failed to initialize Tauri store:', error);
    return null;
  }
}

/**
 * Platform-agnostic storage interface
 * Uses Tauri Store on desktop/mobile, localStorage on web
 */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    if (isTauri) {
      const tauriStore = await getStore();
      if (tauriStore) {
        const value = await tauriStore.get<T>(key);
        return value ?? null;
      }
    }
    
    // Fallback to localStorage
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isTauri) {
      const tauriStore = await getStore();
      if (tauriStore) {
        await tauriStore.set(key, value);
        await tauriStore.save();
        return;
      }
    }
    
    // Fallback to localStorage
    localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    if (isTauri) {
      const tauriStore = await getStore();
      if (tauriStore) {
        await tauriStore.delete(key);
        await tauriStore.save();
        return;
      }
    }
    
    // Fallback to localStorage
    localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (isTauri) {
      const tauriStore = await getStore();
      if (tauriStore) {
        await tauriStore.clear();
        await tauriStore.save();
        return;
      }
    }
    
    // Fallback to localStorage
    localStorage.clear();
  },

  /**
   * Check if running in Tauri environment
   */
  isTauri(): boolean {
    return isTauri;
  }
};

// Default storage keys (matching existing usage in the app)
export const STORAGE_KEYS = {
  API_TOKEN: 'jean2_api_token',
  TOKEN_EXPIRY: 'jean2_token_expiry',
  SERVER_URL: 'jean2_server_url',
  THEME: 'jean2-theme',
  ACTIVE_WORKSPACE_ID: 'activeWorkspaceId',
} as const;
