# 00 — Foundation

Setting up `bun:test` in the server package. This is the prerequisite for everything else.

## 1. Verify Bun's Test Support

Bun has a built-in test runner. No dependencies to install — `bun:test` is part of the runtime:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
```

You still need `@types/bun` (already in devDependencies) for editor autocomplete.

## 2. Add Test Script to package.json

In `packages/server/package.json`, add:

```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage"
  }
}
```

At the monorepo root `package.json`, add:

```json
{
  "scripts": {
    "test:server": "bun test packages/server",
    "test": "bun test packages/server packages/sdk"
  }
}
```

## 3. Test Directory Structure

Tests and test utilities live in a top-level `tests/` directory, separate from production source code:

```
packages/server/
  src/                    # production code only
    utils/
      truncate-tool-result.ts
    store/
      messages.ts
  tests/                  # all test code
    helpers/              # shared test utilities
      db.ts               — in-memory database factory + schema init
      factories.ts        — factory functions for creating test entities
      mocks.ts            — shared mock implementations
    smoke.test.ts         — infrastructure smoke test
    store/
      messages.test.ts    — tests for store/messages
    utils/
      truncate-tool-result.test.ts  — tests for utils/truncate-tool-result
```

Two import conventions are used:

1. **`@/*`** — resolved by Bun from `tsconfig.json` paths. Maps to `./src/*`. Used for importing source modules:
   ```typescript
   import { createWorkspace } from '@/store/workspaces';
   ```

2. **`#tests/*`** — explicit `imports` in `package.json`. Used for importing test helpers:
   ```json
   {
     "imports": {
       "#tests/db": "./tests/helpers/db.ts",
       "#tests/factories": "./tests/helpers/factories.ts",
       "#tests/mocks": "./tests/helpers/mocks.ts"
     }
   }
   ```
   ```typescript
   import { setupTestDatabase } from '#tests/db';
   ```

**Why separate `tests/` instead of co-located `*.test.ts`?** Keeps production source clean. No test files mixed into `src/`, no risk of test utilities leaking into builds. The `tsconfig.json` already excludes `*.test.ts` patterns.

### `db.ts` — In-Memory Database Helper

```typescript
import { Database } from 'bun:sqlite';
import { initializeSchema, setDatabaseForTesting, resetDatabaseForTesting } from '@/store';

/**
 * Create a fresh in-memory SQLite database with full schema initialized.
 * Each call returns a new, isolated DB — no cross-test contamination.
 */
export function createTestDatabase(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  initializeSchema(db);
  return db;
}

/**
 * Set up an in-memory database as the active store singleton.
 * Call this in beforeEach(). Call resetTestDatabase() in afterEach().
 */
export function setupTestDatabase(): Database {
  const db = createTestDatabase();
  setDatabaseForTesting(db);
  return db;
}

/**
 * Tear down the test database singleton.
 * Call this in afterEach() to prevent leaks.
 */
export function resetTestDatabase(): void {
  resetDatabaseForTesting();
}
```

**Important:** The current `store/index.ts` uses a module-level singleton (`let db: Database | null = null`). To test store functions, you need to either:

1. **Override the singleton** — add a `setDatabaseForTesting(db: Database)` function to `store/index.ts`
2. **Use env var** — set `JEAN2_DATABASE_PATH=:memory:` and call `closeDatabase()` between tests

Option 1 is cleaner. Add to `store/index.ts`:

```typescript
// Export schema init so test-utils can initialize in-memory DBs
export function initializeSchema(db: Database): void { ... }

// Inject a test database as the store singleton
export function setDatabaseForTesting(database: Database): void {
  if (db && db !== database) {
    db.close();
  }
  db = database;
}

export function resetDatabaseForTesting(): void {
  if (db) {
    db.close();
  }
  db = null;
}
```

### `factories.ts` — Test Data Factories

```typescript
import type { Session, UserMessage, AssistantMessage, TextPart, ToolPart } from '@jean2/sdk';

export function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    id: crypto.randomUUID(),
    workspaceId: 'test-workspace',
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

export function createTestUserMessage(
  sessionId: string,
  overrides: Partial<UserMessage> = {},
): UserMessage {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'user',
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createTestAssistantMessage(
  sessionId: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'assistant',
    status: 'completed',
    modelId: 'gpt-4o',
    providerId: 'openai',
    tokens: { prompt: 100, completion: 50 },
    cost: 0,
    createdAt: Date.now(),
    completedAt: Date.now(),
    ...overrides,
  };
}

export function createTestTextPart(
  messageId: string,
  text: string = 'Hello world',
  overrides: Partial<TextPart> = {},
): TextPart {
  return {
    id: crypto.randomUUID(),
    messageId,
    createdAt: Date.now(),
    type: 'text',
    text,
    ...overrides,
  };
}

export function createTestToolPart(
  messageId: string,
  overrides: Partial<ToolPart> = {},
): ToolPart {
  return {
    id: crypto.randomUUID(),
    messageId,
    createdAt: Date.now(),
    type: 'tool',
    callId: crypto.randomUUID(),
    name: 'test-tool',
    state: {
      status: 'pending',
      input: { path: '/test' },
    },
    ...overrides,
  };
}
```

### `mocks.ts` — Shared Mock Stubs

```typescript
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';

// ── Broadcast mock ──────────────────────────────────────────────

/**
 * Mock broadcast callback that captures all messages.
 * Use in tests that exercise code calling broadcastEvent().
 */
export function createMockBroadcast() {
  const messages: unknown[] = [];

  return {
    callback: (message: unknown) => {
      messages.push(message);
    },
    messages,
    clear() {
      messages.length = 0;
    },
    last() {
      return messages[messages.length - 1];
    },
  };
}

// ── AI SDK Model mocks ──────────────────────────────────────────
//
// The AI SDK (v6) ships test utilities in `ai/test`:
//   - MockLanguageModelV3 — mock model for generateText / streamText
//   - mockId              — incrementing integer ID generator
//   - mockValues          — cycle through an array of values
//
// Import simulateReadableStream from `ai` (not `ai/test`) for
// controllable streaming in streamText tests.
//
// Key difference from older tutorials: AI SDK v6 uses the V3 spec.
// The doGenerate result uses `content` (not `text`), and
// finishReason/usage have a nested object shape.
//
// @see https://ai-sdk.dev/docs/ai-sdk-core/testing

/**
 * Create a mock LanguageModel for use with `generateText`.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createMockGenerateModel } from '#tests/mocks';
 *
 * const model = createMockGenerateModel({ text: 'Summary of conversation' });
 * const result = await generateText({ model, prompt: 'Summarize' });
 * expect(result.text).toBe('Summary of conversation');
 * ```
 */
export function createMockGenerateModel(options: {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: options.text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: {
          total: options.usage?.inputTokens ?? 10,
          noCache: options.usage?.inputTokens ?? 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: options.usage?.outputTokens ?? 20,
          text: options.usage?.outputTokens ?? 20,
          reasoning: undefined,
        },
      },
      warnings: [],
    }),
  });
}

/**
 * Create a mock LanguageModel for use with `streamText`.
 *
 * Uses `simulateReadableStream` from `ai` to produce controllable
 * text chunks with realistic timing.
 *
 * @example
 * ```typescript
 * import { streamText } from 'ai';
 * import { createMockStreamModel } from '#tests/mocks';
 *
 * const model = createMockStreamModel({
 *   chunks: ['Hello', ', ', 'world!'],
 * });
 * const result = streamText({ model, prompt: 'Hi' });
 * for await (const chunk of result.textStream) {
 *   // 'Hello', ', ', 'world!'
 * }
 * ```
 */
export function createMockStreamModel(options: {
  chunks: string[];
  finishReason?: 'stop' | 'length' | 'tool-calls' | 'error';
  usage?: { inputTokens?: number; outputTokens?: number };
}) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          ...options.chunks.map((delta) => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta,
          })),
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: {
              unified: options.finishReason ?? 'stop',
              raw: undefined,
            },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: options.usage?.inputTokens ?? 10,
                noCache: options.usage?.inputTokens ?? 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: options.usage?.outputTokens ?? 20,
                text: options.usage?.outputTokens ?? 20,
                reasoning: undefined,
              },
            },
          },
        ],
      }),
    }),
  });
}

/**
 * Create a mock LanguageModel that simulates tool calling via streamText.
 *
 * Produces a stream with tool-call chunks, optional tool-result chunks,
 * and an optional final text response.
 *
 * @example
 * ```typescript
 * const model = createMockToolCallModel({
 *   toolCalls: [{
 *     toolName: 'read-file',
 *     args: { path: '/test.txt' },
 *     toolCallId: 'call-1',
 *   }],
 *   toolResults: [{
 *     toolCallId: 'call-1',
 *     toolName: 'read-file',
 *     result: 'file contents here',
 *   }],
 *   finalText: 'I read the file.',
 * });
 * ```
 */
export function createMockToolCallModel(options: {
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    toolCallId: string;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    result: string;
  }>;
  finalText?: string;
}) {
  const calls = options.toolCalls.map((tc) => ({
    type: 'tool-call' as const,
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    input: JSON.stringify(tc.args),
  }));

  const results = options.toolResults?.map((r) => ({
    type: 'tool-result' as const,
    toolCallId: r.toolCallId,
    toolName: r.toolName,
    result: r.result,
  }));

  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          ...calls,
          ...(results ?? []),
          ...(options.finalText
            ? [
                { type: 'text-start' as const, id: 'text-1' },
                { type: 'text-delta' as const, id: 'text-1', delta: options.finalText },
                { type: 'text-end' as const, id: 'text-1' },
              ]
            : []),
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 100, text: 100, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}
```

## 4. Test Template

Every test file should follow this pattern:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Import test helpers
import { setupTestDatabase, resetTestDatabase } from '#tests/db';

// Import the function under test
import { myFunction } from '@/path/to/module';

describe('myFunction', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterEach(() => {
    resetTestDatabase();
  });

  test('does X when Y', () => {
    // Arrange
    const input = { /* ... */ };

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe(expected);
  });

  test('handles edge case Z', () => {
    // ...
  });
});
```

## 5. CI Integration

Add to your GitHub workflow (`.github/workflows/release.yml` or a new `test.yml`):

```yaml
- name: Run server tests
  run: bun test packages/server
```

This should run **before** any build step. If tests fail, the build shouldn't proceed.

## 6. Running Tests

```bash
# Run all server tests
cd packages/server && bun test

# Run a single test file
bun test tests/utils/truncate-tool-result.test.ts

# Run tests matching a pattern
bun test --test-name-pattern "compaction"

# Run with coverage
bun test --coverage

# Watch mode (re-runs on file changes)
bun test --watch
```
