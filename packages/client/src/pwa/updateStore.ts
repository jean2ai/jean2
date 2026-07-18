import { create } from 'zustand';

type ServiceWorkerUpdater = (reloadPage?: boolean) => Promise<void>;

interface PWAUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  dismissed: boolean;
  isUpdating: boolean;
  serviceWorkerUpdater: ServiceWorkerUpdater | null;
  setServiceWorkerUpdater: (updater: ServiceWorkerUpdater) => void;
  markNeedRefresh: () => void;
  markOfflineReady: () => void;
  dismiss: () => void;
  showOnForeground: () => void;
  updateServiceWorker: () => Promise<void>;
}

export const usePWAUpdateStore = create<PWAUpdateState>((set, get) => ({
  needRefresh: false,
  offlineReady: false,
  dismissed: false,
  isUpdating: false,
  serviceWorkerUpdater: null,
  setServiceWorkerUpdater: (updater) => set({ serviceWorkerUpdater: updater }),
  markNeedRefresh: () => set({ needRefresh: true, dismissed: false }),
  markOfflineReady: () => set({ offlineReady: true }),
  dismiss: () => set({ dismissed: true }),
  showOnForeground: () => {
    if (get().needRefresh) {
      set({ dismissed: false });
    }
  },
  updateServiceWorker: async () => {
    const { isUpdating, serviceWorkerUpdater } = get();
    if (isUpdating || !serviceWorkerUpdater) return;

    set({ isUpdating: true });
    try {
      await serviceWorkerUpdater(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PWA] Update activation failed: ${message}`);
      set({ isUpdating: false });
    }
  },
}));
