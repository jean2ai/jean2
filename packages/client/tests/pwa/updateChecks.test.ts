import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setupServiceWorkerUpdateChecks,
  type UpdateCheckDependencies,
} from '@/pwa/updateChecks';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('service worker update checks', () => {
  it('checks on startup, foreground, online, and the periodic interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = { update } as unknown as ServiceWorkerRegistration;
    let intervalCallback: (() => void) | undefined;
    const clearInterval = vi.fn();
    const onForeground = vi.fn();
    const dependencies: UpdateCheckDependencies = {
      fetch: fetchMock as typeof window.fetch,
      document,
      window,
      setInterval: ((callback: TimerHandler) => {
        intervalCallback = callback as () => void;
        return 42;
      }) as typeof window.setInterval,
      clearInterval: clearInterval as unknown as typeof window.clearInterval,
    };

    const stop = setupServiceWorkerUpdateChecks(
      '/sw.js',
      registration,
      dependencies,
      1000,
      onForeground,
    );
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(onForeground).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(3));

    intervalCallback?.();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(4));

    stop();
    expect(clearInterval).toHaveBeenCalledWith(42);
    expect(fetchMock).toHaveBeenCalledWith('/sw.js', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
  });
});
