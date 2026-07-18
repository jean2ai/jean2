import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePWAUpdateStore } from '@/pwa/updateStore';

beforeEach(() => {
  usePWAUpdateStore.setState({
    needRefresh: false,
    offlineReady: false,
    dismissed: false,
    isUpdating: false,
    serviceWorkerUpdater: null,
  });
});

describe('PWA update store', () => {
  it('exposes refresh and offline-ready state', () => {
    act(() => {
      usePWAUpdateStore.getState().markNeedRefresh();
      usePWAUpdateStore.getState().markOfflineReady();
    });

    expect(usePWAUpdateStore.getState()).toMatchObject({
      needRefresh: true,
      offlineReady: true,
      dismissed: false,
    });
  });

  it('reshows a dismissed update on a later foreground event', () => {
    act(() => {
      usePWAUpdateStore.getState().markNeedRefresh();
      usePWAUpdateStore.getState().dismiss();
    });
    expect(usePWAUpdateStore.getState().dismissed).toBe(true);

    act(() => usePWAUpdateStore.getState().showOnForeground());
    expect(usePWAUpdateStore.getState().dismissed).toBe(false);
  });

  it('activates the waiting worker once with reload enabled', async () => {
    const updater = vi.fn().mockResolvedValue(undefined);
    act(() => usePWAUpdateStore.getState().setServiceWorkerUpdater(updater));

    await Promise.all([
      usePWAUpdateStore.getState().updateServiceWorker(),
      usePWAUpdateStore.getState().updateServiceWorker(),
    ]);

    expect(updater).toHaveBeenCalledTimes(1);
    expect(updater).toHaveBeenCalledWith(true);
    expect(usePWAUpdateStore.getState().isUpdating).toBe(true);
  });
});
