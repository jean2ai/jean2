import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Jean2Client } from '@jean2/sdk';
import { useFilePreview } from '@/hooks/useFilePreview';

vi.mock('@jean2/sdk', () => ({
  Jean2Client: vi.fn(),
}));

const mockPreviewFn = vi.fn();

function makeSdkClient(): Jean2Client {
  return {
    http: {
      files: {
        preview: mockPreviewFn,
      },
    },
  } as unknown as Jean2Client;
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useFilePreview', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    mockPreviewFn.mockReset();
  });

  test('initial fetch reports loading', async () => {
    mockPreviewFn.mockReturnValue(
      new Promise(() => {}),
    );

    const { result } = renderHook(
      () => useFilePreview({
        workspaceId: 'ws-1',
        path: '/src/app.ts',
        sdkClient: makeSdkClient(),
        enabled: true,
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.refreshing).toBe(false);
  });

  test('refetch with cached data does not report full-view loading', async () => {
    const previewData = { kind: 'code', content: 'hello', language: 'typescript', size: 5 };
    mockPreviewFn.mockResolvedValue(previewData);

    const { result } = renderHook(
      () => useFilePreview({
        workspaceId: 'ws-1',
        path: '/src/app.ts',
        sdkClient: makeSdkClient(),
        enabled: true,
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(() => vi.waitFor(() => {
      expect(result.current.data).toEqual(previewData);
    }));

    expect(result.current.loading).toBe(false);

    mockPreviewFn.mockResolvedValue({ kind: 'code', content: 'updated', language: 'typescript', size: 7 });

    await act(async () => {
      result.current.reload();
    });

    await act(() => vi.waitFor(() => {
      expect(result.current.data).toEqual({ kind: 'code', content: 'updated', language: 'typescript', size: 7 });
    }));

    expect(result.current.loading).toBe(false);
  });

  test('explicit reload calls the query refetch function', async () => {
    const previewData = { kind: 'code', content: 'first', language: 'typescript', size: 5 };
    mockPreviewFn.mockResolvedValue(previewData);

    const { result } = renderHook(
      () => useFilePreview({
        workspaceId: 'ws-1',
        path: '/src/app.ts',
        sdkClient: makeSdkClient(),
        enabled: true,
      }),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(() => vi.waitFor(() => {
      expect(result.current.data).toEqual(previewData);
    }));

    expect(mockPreviewFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.reload();
    });

    await act(() => vi.waitFor(() => {
      expect(mockPreviewFn).toHaveBeenCalledTimes(2);
    }));
  });
});
