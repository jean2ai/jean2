import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { ToolPart } from '@jean2/sdk';
import type { SessionHandlersContext } from '@/handlers/serverMessage/types';

const { mockInvalidate } = vi.hoisted(() => ({ mockInvalidate: vi.fn() }));

vi.mock('@/components/providers/QueryProvider', () => {
  return { queryClient: { invalidateQueries: mockInvalidate } };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/stores/pendingOperationsStore', () => ({
  usePendingOperationsStore: {
    getState: () => ({
      clearOperation: vi.fn(),
      getSessionPendingOperations: () => [],
      clearSessionOperations: vi.fn(),
    }),
  },
}));

import { handlePartUpdated } from '@/handlers/serverMessage/messagePartHandlers';
import { queryKeys } from '@/lib/queryKeys';

function getInvalidatedKeys(): readonly (readonly unknown[])[] {
  return mockInvalidate.mock.calls.map((c: unknown[]) => {
    const arg = c[0] as { queryKey: readonly unknown[] };
    return arg.queryKey;
  });
}

function makeCtx(): SessionHandlersContext {
  return {
    setMessagesBySession: vi.fn(),
    setPartsBySession: vi.fn(),
    setSessionUsage: vi.fn(),
    setCurrentModel: vi.fn(),
    addStreamingSession: vi.fn(),
    removeStreamingSession: vi.fn(),
    removeInterruptedSession: vi.fn(),
    partIdIndexRef: { current: new Map() },
    partAppendRafRef: { current: null },
    partAppendTimeoutRef: { current: null },
    flushPendingPartAppends: vi.fn(),
    pendingPartAppendsRef: { current: new Map() },
    currentSessionIdRef: { current: 'sess-1' },
    sessionsRef: { current: [] },
    setCompletion: vi.fn(),
    clearCompletion: vi.fn(),
    chatFinishSoundEnabledRef: { current: false },
    playChatFinishSound: vi.fn(),
    setCompactionSuccess: vi.fn(),
    interruptedSessions: new Set<string>(),
  } as unknown as SessionHandlersContext;
}

function makeToolPart(
  name: string,
  status: 'completed' | 'error' | 'interrupted',
): ToolPart {
  return {
    id: 'part-1',
    messageId: 'msg-1',
    type: 'tool',
    name,
    state: { status },
  } as unknown as ToolPart;
}

describe('messagePartHandlers - file query invalidation', () => {
  beforeEach(() => {
    mockInvalidate.mockClear();
  });

  test('completed file-mutating tool invalidates browse, search, and git-status', () => {
    const part = makeToolPart('edit', 'completed');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    expect(invalidatedKeys).toContainEqual(queryKeys.files.browsePrefix);
    expect(invalidatedKeys).toContainEqual(queryKeys.files.searchPrefix);
    expect(invalidatedKeys).toContainEqual(queryKeys.files.gitStatusPrefix);
  });

  test('does not invalidate file preview or git-diff queries', () => {
    const part = makeToolPart('edit', 'completed');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    const hasPreview = invalidatedKeys.some(
      (k) => k[0] === 'files' && k[1] === 'preview',
    );
    const hasGitDiff = invalidatedKeys.some(
      (k) => k[0] === 'files' && k[1] === 'git-diff',
    );
    expect(hasPreview).toBe(false);
    expect(hasGitDiff).toBe(false);
  });

  test('error terminal state triggers same invalidation', () => {
    const part = makeToolPart('write-file', 'error');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    expect(invalidatedKeys).toContainEqual(queryKeys.files.browsePrefix);
    expect(invalidatedKeys).toContainEqual(queryKeys.files.gitStatusPrefix);
  });

  test('interrupted terminal state triggers same invalidation', () => {
    const part = makeToolPart('apply-patch', 'interrupted');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    expect(invalidatedKeys).toContainEqual(queryKeys.files.browsePrefix);
  });

  test('shell is classified as file-mutating and invalidates file queries', () => {
    const part = makeToolPart('shell', 'completed');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    expect(invalidatedKeys).toContainEqual(queryKeys.files.browsePrefix);
    expect(invalidatedKeys).toContainEqual(queryKeys.files.gitStatusPrefix);
  });

  test('non-file tool does not invalidate file queries', () => {
    const part = makeToolPart('read-file', 'completed');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    const invalidatedKeys = getInvalidatedKeys();

    const hasAnyFileKey = invalidatedKeys.some(
      (k) => k[0] === 'files',
    );
    expect(hasAnyFileKey).toBe(false);
  });

  test('file-mutating tool in non-terminal state does not invalidate', () => {
    const part = makeToolPart('edit', 'running' as 'completed');
    handlePartUpdated({ type: 'part.updated', sessionId: 'sess-1', part }, makeCtx());

    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
