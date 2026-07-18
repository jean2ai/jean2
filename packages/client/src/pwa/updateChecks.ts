const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateCheckDependencies {
  fetch: typeof window.fetch;
  document: Document;
  window: Window;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
}

function defaultDependencies(): UpdateCheckDependencies {
  return {
    fetch: window.fetch.bind(window),
    document,
    window,
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
}

export function setupServiceWorkerUpdateChecks(
  serviceWorkerUrl: string,
  registration: ServiceWorkerRegistration,
  dependencies: UpdateCheckDependencies = defaultDependencies(),
  intervalMs = UPDATE_INTERVAL_MS,
  onForeground?: () => void,
): () => void {
  let checkInProgress: Promise<void> | null = null;

  const checkForUpdate = (): Promise<void> => {
    if (checkInProgress) return checkInProgress;

    checkInProgress = (async () => {
      const response = await dependencies.fetch(serviceWorkerUrl, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) {
        throw new Error(`Service worker check returned ${response.status}`);
      }
      await registration.update();
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PWA] Update check failed: ${message}`);
    }).finally(() => {
      checkInProgress = null;
    });

    return checkInProgress;
  };

  const handleVisibilityChange = (): void => {
    if (dependencies.document.visibilityState === 'visible') {
      onForeground?.();
      void checkForUpdate();
    }
  };
  const handleOnline = (): void => {
    void checkForUpdate();
  };

  dependencies.document.addEventListener('visibilitychange', handleVisibilityChange);
  dependencies.window.addEventListener('online', handleOnline);
  const intervalId = dependencies.setInterval(() => {
    void checkForUpdate();
  }, intervalMs);
  void checkForUpdate();

  return () => {
    dependencies.document.removeEventListener('visibilitychange', handleVisibilityChange);
    dependencies.window.removeEventListener('online', handleOnline);
    dependencies.clearInterval(intervalId);
  };
}
