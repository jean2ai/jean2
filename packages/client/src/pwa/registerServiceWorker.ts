import { registerSW } from 'virtual:pwa-register';

import { setupServiceWorkerUpdateChecks } from './updateChecks';
import { usePWAUpdateStore } from './updateStore';

let stopUpdateChecks: (() => void) | undefined;

export function registerJean2ServiceWorker(): void {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      usePWAUpdateStore.getState().markNeedRefresh();
    },
    onOfflineReady() {
      usePWAUpdateStore.getState().markOfflineReady();
    },
    onRegisteredSW(serviceWorkerUrl, registration) {
      stopUpdateChecks?.();
      if (!registration) {
        console.error('[PWA] Service worker registration completed without a registration object');
        return;
      }
      stopUpdateChecks = setupServiceWorkerUpdateChecks(
        serviceWorkerUrl,
        registration,
        undefined,
        undefined,
        usePWAUpdateStore.getState().showOnForeground,
      );
    },
    onRegisterError(err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PWA] Service worker registration failed: ${message}`);
    },
  });

  usePWAUpdateStore.getState().setServiceWorkerUpdater(updateServiceWorker);
}
