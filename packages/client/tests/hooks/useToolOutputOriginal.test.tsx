import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToolOutputOriginal } from '@/hooks/useToolOutputOriginal';

vi.mock('@/contexts/ServerClientContext', () => ({
  useSdkClient: vi.fn(),
}));

import { useSdkClient } from '@/contexts/ServerClientContext';

const mockedUseSdkClient = vi.mocked(useSdkClient);

const mockGetToolOutput = vi.fn();

function setupClient(client: unknown) {
  mockedUseSdkClient.mockReturnValue(client as never);
}

function clearClient() {
  mockedUseSdkClient.mockReturnValue(null);
}

describe('useToolOutputOriginal', () => {
  afterEach(() => {
    mockGetToolOutput.mockReset();
    mockedUseSdkClient.mockReset();
  });

  test('does not fetch when retrievalId is missing', () => {
    setupClient({ http: { sessions: { getToolOutput: mockGetToolOutput } } });
    const { result } = renderHook(() =>
      useToolOutputOriginal({ sessionId: 's1', retrievalId: null }),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockGetToolOutput).not.toHaveBeenCalled();
  });

  test('does not fetch when enabled is false', () => {
    setupClient({ http: { sessions: { getToolOutput: mockGetToolOutput } } });
    const { result } = renderHook(() =>
      useToolOutputOriginal({
        sessionId: 's1',
        retrievalId: 'j2out_a',
        enabled: false,
      }),
    );
    expect(mockGetToolOutput).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  test('reload fetches manually when automatic loading is disabled', async () => {
    setupClient({ http: { sessions: { getToolOutput: mockGetToolOutput } } });
    mockGetToolOutput.mockResolvedValue({
      artifact: { id: 'j2out_a' },
      output: { matches: [] },
    });
    const { result } = renderHook(() =>
      useToolOutputOriginal({
        sessionId: 's1',
        retrievalId: 'j2out_a',
        enabled: false,
      }),
    );

    await act(async () => {
      result.current.reload();
      await Promise.resolve();
    });

    expect(mockGetToolOutput).toHaveBeenCalledTimes(1);
    expect(result.current.data?.artifact.id).toBe('j2out_a');
  });

  test('does not fetch when client is missing', () => {
    clearClient();
    const { result } = renderHook(() =>
      useToolOutputOriginal({ sessionId: 's1', retrievalId: 'j2out_a' }),
    );
    expect(mockGetToolOutput).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  test('populates data on successful fetch', async () => {
    setupClient({ http: { sessions: { getToolOutput: mockGetToolOutput } } });
    mockGetToolOutput.mockResolvedValue({
      artifact: {
        id: 'j2out_a',
        sessionId: 's1',
        partId: 'p1',
        callId: 'call-1',
        toolName: 'grep',
        strategy: 'records',
        sourceHash: 'sha256:abc',
        originalChars: 100,
        modelChars: 20,
        createdAt: 0,
        applied: true,
        compressionDurationMs: 1,
        modelRetrievalCount: 0,
        userRetrievalCount: 0,
        lastRetrievedAt: null,
      },
      output: { matches: [{ file: 'f.ts' }] },
    });

    const { result } = renderHook(() =>
      useToolOutputOriginal({ sessionId: 's1', retrievalId: 'j2out_a' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.artifact.id).toBe('j2out_a');
    expect(mockGetToolOutput).toHaveBeenCalledTimes(1);
  });

  test('captures error message when fetch fails', async () => {
    setupClient({ http: { sessions: { getToolOutput: mockGetToolOutput } } });
    mockGetToolOutput.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useToolOutputOriginal({ sessionId: 's1', retrievalId: 'j2out_a' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });
});

describe('describeCompressionSavings', () => {
  test('returns 0% for missing metadata', async () => {
    const { describeCompressionSavings } = await import('@/hooks/useToolOutputOriginal');
    expect(describeCompressionSavings(undefined)).toBe('');
  });

  test('returns formatted percentage', async () => {
    const { describeCompressionSavings } = await import('@/hooks/useToolOutputOriginal');
    expect(describeCompressionSavings({ originalChars: 100, modelChars: 25 })).toBe('75%');
    expect(describeCompressionSavings({ originalChars: 100, modelChars: 100 })).toBe('0%');
  });
});