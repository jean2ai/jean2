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
