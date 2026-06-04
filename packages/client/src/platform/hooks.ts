import { useCallback } from 'react';
import { platform, hasCapability } from './singleton';
import type { PlatformSoundKey, PlatformStorage, PlatformCapabilities } from './types';

export function useCapability() {
  return useCallback(<K extends keyof PlatformCapabilities>(key: K): boolean => {
    return hasCapability(key);
  }, []);
}

function localStorageGet<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : null;
  } catch {
    return null;
  }
}

function createLocalStorageAdapter(): PlatformStorage {
  return {
    get: <T>(key: string) => Promise.resolve(localStorageGet<T>(key)),
    set: <T>(key: string, value: T) => {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    },
    remove: (key: string) => {
      localStorage.removeItem(key);
      return Promise.resolve();
    },
    clear: () => {
      localStorage.clear();
      return Promise.resolve();
    },
  };
}

const localStorageAdapter = createLocalStorageAdapter();

export function useStorage(): PlatformStorage {
  if (hasCapability('storage') && platform.storage) {
    return platform.storage;
  }
  return localStorageAdapter;
}

export function usePlaySound() {
  return useCallback((key: PlatformSoundKey) => {
    if (hasCapability('sound') && platform.playSound) {
      void platform.playSound(key);
    }
  }, []);
}
