import { describe, test, expect, mock, afterEach } from 'bun:test';
import type { Session } from '@jean2/sdk';

interface ExecutorResult {
  ok: boolean;
  error?: string;
  reason: string;
  skipped?: boolean;
  triggerMessageId?: string | null;
  result?: {
    tokensUsed: { prompt: number; completion: number };
    summaryMessageId: string;
    textParts: Array<{ id: string; messageId: string; createdAt: number; type: string; text: string }>;
  };
}

async function setupMocks(opts: {
  sessions?: Map<string, Session>;
  shouldThrow?: Error;
}) {
  const sessionStore = opts.sessions ?? new Map<string, Session>();
  const sessionUpdates = new Map<string, Record<string, unknown>[]>();

  mock.module('@/store', () => ({
    getSession: mock((id: string): Session | null => sessionStore.get(id) ?? null),
    updateSession: mock((id: string, updates: Record<string, unknown>): Session | null => {
      const calls = sessionUpdates.get(id) ?? [];
      calls.push(updates);
      sessionUpdates.set(id, calls);
      const existing = sessionStore.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      sessionStore.set(id, updated);
      return updated;
    }),
    listMessagesWithParts: mock((_sessionId: string) => []),
  }));

  mock.module('@/core/broadcast', () => ({
    broadcastEvent: mock((_event: unknown) => {}),
    broadcastSessionUpdated: mock((_session: unknown) => {}),
  }));

  mock.module('@/core/compaction', () => ({
    resolveCompactionPolicy: mock(() => ({
      modelId: null, providerId: null, maxOutputTokens: 4096,
      overflowThresholdRatio: null, preserveRecentToolCount: 3,
      preserveSmallToolChars: 5000, toolClearCharsThreshold: 10000,
      maxPrunedToolCount: 50, autoThresholdRatio: 0.8,
      autoReserveCapTokens: 0, autoSafetyMarginTokens: 0,
    })),
    createCompactionTrigger: mock((_sessionId: string, _reason: string) => ({
      messageId: 'trigger-msg-1', reason: 'manual',
    })),
    processCompactionTask: mock(async (_sessionId: string, _triggerMessageId: string, _policy: unknown) => {
      if (opts.shouldThrow) throw opts.shouldThrow;
      return {
        tokensUsed: { prompt: 1000, completion: 200 },
        summaryMessage: { id: 'summary-msg-1', sessionId: 'sess-1', role: 'assistant', createdAt: Date.now() },
        textParts: [
          { id: 'part-1', messageId: 'summary-msg-1', createdAt: Date.now(), type: 'text', text: 'Summary of conversation' },
        ],
      };
    }),
    persistCompactionFailure: mock((_sessionId: string, _triggerMessageId: string, _error: string) => {}),
  }));

  mock.module('@/config', () => ({
    getModelsConfig: mock(() => ({
      defaultModel: 'gpt-4o',
      defaultProvider: 'openai',
      models: [],
    })),
  }));

  const { executeCompaction } = await import('@/core/compaction-executor');
  return { executeCompaction, sessionUpdates };
}

function createMainSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    workspaceId: 'ws-1',
    preconfigId: null,
    title: 'Test Session',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: null,
    selectedModel: null,
    selectedProvider: null,
    selectedVariant: null,
    parentId: null,
    agentName: null,
    subagentStatus: null,
    runningAt: null,
    compacting: false,
    ...overrides,
  };
}

describe('compaction-executor', () => {
  afterEach(() => mock.restore());

  // ── Guard: main session only ────────────────────────────────

  describe('main session guard', () => {
    test('returns error when session not found', async () => {
      const { executeCompaction } = await setupMocks({ sessions: new Map() });
      const result = await executeCompaction('nonexistent', 'manual');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Compaction is only available for main sessions');
        expect(result.skipped).toBe(true);
        expect(result.triggerMessageId).toBeNull();
      }
    });

    test('returns error for child session (has parentId)', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('child-1', createMainSession({ id: 'child-1', parentId: 'parent-1' }));
      const { executeCompaction } = await setupMocks({ sessions });

      const result = await executeCompaction('child-1', 'manual');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Compaction is only available for main sessions');
        expect(result.skipped).toBe(true);
      }
    });
  });

  // ── Compacting state transitions ────────────────────────────

  describe('compacting state transitions', () => {
    test('sets compacting to true then false on success', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction, sessionUpdates } = await setupMocks({ sessions });

      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(true);
      const updates = sessionUpdates.get('sess-1') ?? [];
      const compactingTrue = updates.find(u => 'compacting' in u && u.compacting === true);
      const compactingFalse = updates.find(u => 'compacting' in u && u.compacting === false);
      expect(compactingTrue).toBeDefined();
      expect(compactingFalse).toBeDefined();
    });

    test('sets compacting to false on failure', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction, sessionUpdates } = await setupMocks({
        sessions,
        shouldThrow: new Error('LLM error'),
      });

      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.skipped).toBe(false);
      }
      const updates = sessionUpdates.get('sess-1') ?? [];
      const compactingFalse = updates.find(u => 'compacting' in u && u.compacting === false);
      expect(compactingFalse).toBeDefined();
    });
  });

  // ── Policy resolution ───────────────────────────────────────

  describe('policy resolution', () => {
    test('uses session selectedModel when set', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession({
        selectedModel: 'claude-3-opus',
        selectedProvider: 'anthropic',
      }));
      const { executeCompaction } = await setupMocks({ sessions });

      await executeCompaction('sess-1', 'manual');

      const { resolveCompactionPolicy } = await import('@/core/compaction');
      expect(resolveCompactionPolicy).toHaveBeenCalledWith('claude-3-opus', 'anthropic');
    });

    test('uses default model when session has no selection', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession({
        selectedModel: null,
        selectedProvider: null,
      }));
      const { executeCompaction } = await setupMocks({ sessions });

      await executeCompaction('sess-1', 'manual');

      const { resolveCompactionPolicy } = await import('@/core/compaction');
      expect(resolveCompactionPolicy).toHaveBeenCalledWith('gpt-4o', 'openai');
    });
  });

  // ── Successful compaction ───────────────────────────────────

  describe('successful compaction', () => {
    test('returns ok result with token usage', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction } = await setupMocks({ sessions });

      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result!.tokensUsed).toEqual({ prompt: 1000, completion: 200 });
        expect(result.result!.summaryMessageId).toBe('summary-msg-1');
        expect(result.triggerMessageId).toBe('trigger-msg-1');
        expect(result.reason).toBe('manual');
      }
    });

    test('returns text parts in result', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction } = await setupMocks({ sessions });

      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result!.textParts).toHaveLength(1);
        expect(result.result!.textParts[0].text).toBe('Summary of conversation');
      }
    });

    test('updates session tokens from compaction result', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction, sessionUpdates } = await setupMocks({ sessions });

      await executeCompaction('sess-1', 'manual');

      const updates = sessionUpdates.get('sess-1') ?? [];
      const tokenUpdate = updates.find(u => 'totalTokens' in u);
      expect(tokenUpdate).toBeDefined();
      expect(tokenUpdate!.promptTokens).toBe(1000);
      expect(tokenUpdate!.completionTokens).toBe(200);
      expect(tokenUpdate!.totalTokens).toBe(1200);
    });
  });

  // ── Failed compaction ───────────────────────────────────────

  describe('failed compaction', () => {
    test('returns error result when processCompactionTask throws', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction } = await setupMocks({
        sessions,
        shouldThrow: new Error('Model unavailable'),
      });

      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Model unavailable');
        expect(result.triggerMessageId).toBe('trigger-msg-1');
        expect(result.reason).toBe('manual');
        expect(result.skipped).toBe(false);
      }
    });

    test('persists compaction failure', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());
      const { executeCompaction } = await setupMocks({
        sessions,
        shouldThrow: new Error('Token limit exceeded'),
      });

      await executeCompaction('sess-1', 'manual');

      const { persistCompactionFailure } = await import('@/core/compaction');
      expect(persistCompactionFailure).toHaveBeenCalledWith('sess-1', 'trigger-msg-1', 'Token limit exceeded');
    });

    test('handles non-Error thrown values', async () => {
      const sessions = new Map<string, Session>();
      sessions.set('sess-1', createMainSession());

      mock.module('@/store', () => ({
        getSession: mock((id: string): Session | null => sessions.get(id) ?? null),
        updateSession: mock((id: string, updates: Record<string, unknown>): Session | null => {
          const existing = sessions.get(id);
          if (!existing) return null;
          const updated = { ...existing, ...updates };
          sessions.set(id, updated);
          return updated;
        }),
        listMessagesWithParts: mock((_sessionId: string) => []),
      }));

      mock.module('@/core/broadcast', () => ({
        broadcastEvent: mock((_event: unknown) => {}),
        broadcastSessionUpdated: mock((_session: unknown) => {}),
      }));

      mock.module('@/core/compaction', () => ({
        resolveCompactionPolicy: mock(() => ({ modelId: null, providerId: null })),
        createCompactionTrigger: mock(() => ({ messageId: 'trigger-msg-1', reason: 'manual' })),
        processCompactionTask: mock(async () => { throw 'string error'; }),
        persistCompactionFailure: mock(() => {}),
      }));

      mock.module('@/config', () => ({
        getModelsConfig: mock(() => ({ defaultModel: 'gpt-4o', defaultProvider: 'openai' })),
      }));

      const { executeCompaction } = await import('@/core/compaction-executor');
      const result = await executeCompaction('sess-1', 'manual');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Compaction failed');
      }
    });
  });

  // ── Reason propagation ──────────────────────────────────────

  describe('reason propagation', () => {
    test.each(['manual', 'auto', 'overflow'] as const)(
      'propagates "%s" reason through result',
      async (reason) => {
        const sessions = new Map<string, Session>();
        sessions.set('sess-1', createMainSession());
        const { executeCompaction } = await setupMocks({ sessions });

        const result = await executeCompaction('sess-1', reason);
        expect(result.reason).toBe(reason);
      },
    );
  });
});
