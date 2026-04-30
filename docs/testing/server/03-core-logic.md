# 03 — Core Logic Tests

These tests cover the "brain" of the server: compaction, message conversion, retry logic, and session operations. Most require a database and some mocking of external dependencies (AI SDK, broadcast).

## Modules to Test

### 1. `core/compaction.ts` (622 lines) — Most Complex

This is the hardest module to test, but also where the most bugs live. Strategy: test the pure logic functions directly, mock the AI SDK calls.

**What needs mocking:**
- `generateText` / `streamText` from AI SDK (the actual LLM calls)
- `broadcastEvent` (just verify it gets called)
- Store functions use real in-memory DB

**Testable pure functions:**
- `getDefaultCompactionPolicy()` — reads env vars
- `resolveCompactionPolicy()` — merge logic
- `buildConversationText()` — private, but can test through `processCompactionTask` or export for testing
- `estimateToolOutputSize()` — private, but pure
- `markToolsAsCompacted()` — requires DB
- `formatOutput()` — private, pure

**Example tests:**

```typescript
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { setDatabaseForTesting, resetDatabaseForTesting, initializeSchema } from '@/store';
import {
  getDefaultCompactionPolicy,
  resolveCompactionPolicy,
  createCompactionTrigger,
} from './compaction';

describe('compaction', () => {
  let db: Database;
  const sessionId = 'sess1';

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    setDatabaseForTesting(db);
    // Setup workspace + session
    db.run("INSERT INTO workspaces (id, name, path, is_virtual, created_at, updated_at) VALUES ('ws1', 'test', '/test', 0, datetime('now'), datetime('now'))");
    db.run("INSERT INTO sessions (id, workspace_id, title, status, created_at, updated_at) VALUES ('sess1', 'ws1', 'Test', 'active', datetime('now'), datetime('now'))");
  });

  afterEach(() => {
    resetDatabaseForTesting();
  });

  describe('resolveCompactionPolicy', () => {
    test('returns defaults when no overrides', () => {
      const policy = resolveCompactionPolicy('gpt-4o', 'openai');
      expect(policy.maxOutputTokens).toBeGreaterThan(0);
      expect(policy.preserveRecentToolCount).toBeGreaterThanOrEqual(0);
    });

    test('overrides take precedence over defaults', () => {
      const policy = resolveCompactionPolicy('gpt-4o', 'openai', {
        maxOutputTokens: 9999,
        preserveRecentToolCount: 10,
      });
      expect(policy.maxOutputTokens).toBe(9999);
      expect(policy.preserveRecentToolCount).toBe(10);
    });

    test('session model/provider used as fallback', () => {
      const policy = resolveCompactionPolicy('claude-3-opus', 'anthropic');
      // modelId/providerId come from session params unless overridden
      expect(policy.modelId).toBeDefined();
    });
  });

  describe('createCompactionTrigger', () => {
    test('creates trigger message with compaction part', () => {
      // Need at least 2 non-system messages
      createMessage({ id: 'msg1', sessionId, role: 'user', createdAt: 1000 });
      createMessage({ id: 'msg2', sessionId, role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });

      const trigger = createCompactionTrigger(sessionId, 'manual');
      expect(trigger.messageId).toBeDefined();
      expect(trigger.reason).toBe('manual');

      // Verify trigger message exists in DB
      const msg = getMessage(trigger.messageId);
      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('user');
    });

    test('throws when fewer than 2 non-system messages', () => {
      createMessage({ id: 'msg1', sessionId, role: 'user', createdAt: 1000 });
      expect(() => createCompactionTrigger(sessionId, 'manual')).toThrow();
    });
  });
});
```

---

### 2. `core/message-utils.ts` (251 lines)

Converts internal `MessageWithParts` to AI SDK's `ModelMessage` format. Complex transformation logic with many edge cases.

**What needs mocking:**
- `getAttachment` from store (for image/file resolution)
- `Bun.file` (for reading attachment data)

**Key test scenarios:**

```typescript
import { convertToAiSdkMessages } from './message-utils';

describe('convertToAiSdkMessages', () => {
  test('converts simple text messages', async () => {
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'user', createdAt: 0 },
        parts: [{ id: 'p1', messageId: 'm1', createdAt: 0, type: 'text', text: 'Hello' }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  test('skips compact_failed messages', async () => {
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'assistant', createdAt: 0, status: 'error', modelId: 'x', providerId: 'y', tokens: { prompt: 0, completion: 0 }, cost: 0, mode: 'compact_failed' },
        parts: [{ id: 'p1', messageId: 'm1', createdAt: 0, type: 'text', text: 'failed' }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    expect(result).toHaveLength(0); // compact_failed skipped
  });

  test('converts compaction trigger to user question', async () => {
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'user', createdAt: 0 },
        parts: [{ id: 'p1', messageId: 'm1', createdAt: 0, type: 'compaction', auto: true, overflow: false }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  test('overflow compaction trigger asks to continue', async () => {
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'user', createdAt: 0 },
        parts: [{ id: 'p1', messageId: 'm1', createdAt: 0, type: 'compaction', auto: true, overflow: true }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    const content = result[0].content as string;
    expect(content).toContain('Continue');
  });

  test('handles tool call + tool result pairs', async () => {
    const callId = 'call-1';
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'assistant', createdAt: 0, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 },
        parts: [{
          id: 'p1', messageId: 'm1', createdAt: 0, type: 'tool', callId,
          name: 'read-file', state: { status: 'completed', input: { path: '/test' }, output: 'file contents' },
        }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    // Should produce assistant with tool-call + tool role with tool-result
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('tool');
  });

  test('compacted tool outputs show "[Old tool result content cleared]"', async () => {
    const messages: MessageWithParts[] = [
      {
        message: { id: 'm1', sessionId: 's1', role: 'assistant', createdAt: 0, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 },
        parts: [{
          id: 'p1', messageId: 'm1', createdAt: 0, type: 'tool', callId: 'call-1',
          name: 'read-file', state: { status: 'completed', input: {}, output: 'big data', compactedAt: 12345 },
        }],
      },
    ];

    const result = await convertToAiSdkMessages(messages);
    const toolResult = result.find(r => r.role === 'tool');
    expect(toolResult).toBeDefined();
  });

  test('pending/running/interrupted tools synthesize error results', async () => {
    for (const status of ['pending', 'running', 'interrupted']) {
      const messages: MessageWithParts[] = [
        {
          message: { id: 'm1', sessionId: 's1', role: 'assistant', createdAt: 0, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 },
          parts: [{
            id: 'p1', messageId: 'm1', createdAt: 0, type: 'tool', callId: 'call-1',
            name: 'read-file', state: { status, input: {} },
          }],
        },
      ];

      const result = await convertToAiSdkMessages(messages);
      const toolResult = result.find(r => r.role === 'tool');
      expect(toolResult).toBeDefined();
    }
  });
});
```

---

### 3. `core/retry.ts` (81 lines)

Wraps `streamChat` with retry logic. Test the retry behavior without actually calling the LLM.

```typescript
import { streamChatWithRetry } from './retry';

describe('streamChatWithRetry', () => {
  test('yields events from successful stream', async () => {
    // Mock the dynamic import of streamChat
    const events = [];
    for await (const event of streamChatWithRetry({
      sessionId: 'test',
      preconfig: { id: 'test', name: 'test', description: '', systemPrompt: '', tools: [] },
      messages: [],
    })) {
      events.push(event);
    }
    // Verify behavior based on mock
  });

  test('retries on retryable errors up to maxRetries', async () => {
    // Mock streamChat to throw 500 error twice, then succeed
  });

  test('yields rate limit error event when max retries hit', async () => {
    // Mock streamChat to always throw 429
  });

  test('yields context overflow error without retrying', async () => {
    // Mock streamChat to throw context overflow
  });
});
```

> **Note:** Testing `streamChatWithRetry` requires mocking the dynamic import `await import('./agent')`. Consider using `bun:test`'s `mock.module()` or refactoring to accept a `streamChat` function parameter.

---

### 4. `core/fork.ts` (111 lines) and `core/revert.ts` (73 lines)

Both are straightforward DB operations. Test with real in-memory DB.

```typescript
describe('forkSession', () => {
  test('copies messages up to target message', async () => {
    // Create session with messages
    // Fork at message 3
    // Verify forked session has messages 1-3
  });

  test('throws if source session not found', async () => {
    await expect(forkSession({ sessionId: 'nonexistent', targetMessageId: 'x' }))
      .rejects.toThrow('Source session not found');
  });

  test('throws if target message not found', async () => {
    // Create session with messages
    await expect(forkSession({ sessionId: 's1', targetMessageId: 'nonexistent' }))
      .rejects.toThrow('Target message not found');
  });
});

describe('revertToStep', () => {
  test('deletes messages after target', async () => {
    // Create 5 messages
    // Revert to message 3
    // Verify messages 4-5 are deleted, message 3 remains
  });

  test('deletes ALL messages when target is first', async () => {
    // Create 3 messages
    // Revert to message 1 (index 0)
    // Verify all deleted
  });

  test('marks streaming messages as error after revert', async () => {
    // Create messages, one with status='streaming'
    // Revert to earlier message
    // Verify streaming message now has status='error'
  });
});
```

---

### 5. `core/interrupt.ts` (138 lines)

Test the InterruptManager class directly — it's a pure in-memory state machine.

```typescript
import { interruptManager } from './interrupt';

describe('InterruptManager', () => {
  beforeEach(() => {
    // Reset any state
  });

  test('registerSession returns AbortController', () => {
    const controller = interruptManager.registerSession('sess1');
    expect(controller).toBeInstanceOf(AbortController);
    expect(interruptManager.isSessionActive('sess1')).toBe(true);
  });

  test('unregisterSession removes context', () => {
    interruptManager.registerSession('sess1');
    interruptManager.unregisterSession('sess1');
    expect(interruptManager.isSessionActive('sess1')).toBe(false);
  });

  test('interruptSession aborts controller and tools', async () => {
    const controller = interruptManager.registerSession('sess1');
    interruptManager.registerToolExecution('sess1', 'tool-1');

    await interruptManager.interruptSession('sess1');
    expect(controller.signal.aborted).toBe(true);
    expect(interruptManager.isSessionInterrupted('sess1')).toBe(true);
  });

  test('child sessions get cascaded interrupt', async () => {
    interruptManager.registerSession('parent');
    // Need to mock getSession to return session with parentId
    // Then register child, interrupt parent, verify child also interrupted
  });
});
```

---

## Estimated Effort

| Module | Lines | Test Cases | Time |
|--------|-------|------------|------|
| core/compaction (pure parts) | 622 | ~15 | 40 min |
| core/message-utils | 251 | ~12 | 30 min |
| core/retry | 81 | ~5 | 20 min |
| core/fork | 111 | ~5 | 15 min |
| core/revert | 73 | ~4 | 10 min |
| core/interrupt | 138 | ~6 | 20 min |
| **Total** | **1276** | **~47** | **~135 min** |

47 test cases covering the core decision-making logic. Combined with the store tests, this gives coverage of the most critical paths in the server.
