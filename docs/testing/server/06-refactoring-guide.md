# 06 — Refactoring Guide

How to make existing code testable without breaking it. These are targeted, low-risk refactorings that unlock testability.

## Principles

1. **Never refactor without a test.** Write a failing test first, then refactor to make it pass.
2. **Small changes.** One refactoring per commit. Each should leave the codebase working.
3. **Extract, don't rewrite.** Pull logic out of big functions into small, testable ones.
4. **Dependency injection over mocking.** Pass dependencies as parameters instead of importing them directly.

## Refactoring Catalog

### 1. Export `initializeSchema` from `store/index.ts`

**Current:** `function initializeSchema(db: Database): void {` (private)
**After:** `export function initializeSchema(db: Database): void {`

**Why:** Tests need to initialize the schema on an in-memory DB.
**Risk:** Zero — just adds an export, no behavior change.
**Time:** 30 seconds.

### 2. Add Test Helpers to `store/index.ts`

**Add:**
```typescript
export function setDatabaseForTesting(database: Database): void {
  db = database;
}

export function resetDatabaseForTesting(): void {
  if (db) db.close();
  db = null;
}
```

**Why:** Lets tests inject an in-memory DB instead of using the file-based singleton.
**Risk:** Zero — these functions are only called by test code.
**Time:** 2 minutes.

### 3. Extract Message Handlers from `index.ts`

**Current:** `index.ts` is ~500 lines with inline handler logic for every WebSocket message type.

**After:** Create `core/message-router.ts`:

```typescript
// Before (index.ts):
ws.on('message', (data) => {
  const message = JSON.parse(data) as ClientMessage;
  switch (message.type) {
    case 'chat.send': {
      // 40 lines of handler logic inline
      break;
    }
    // ... 8 more cases
  }
});

// After:
import { handleMessage } from './core/message-router';

ws.on('message', (data) => {
  const message = JSON.parse(data) as ClientMessage;
  handleMessage(message, { broadcast, getSession, ... });
});
```

**Why:** Makes every message handler independently testable.
**Risk:** Low — just moving code, no logic changes.
**Time:** 60 minutes for the initial extraction, then incremental.

### 4. Split `app.ts` Routes into Separate Files

**Current:** `app.ts` is ~500 lines with all routes inline.

**After:**
```
src/routes/
  sessions.ts    — session CRUD routes
  workspaces.ts  — workspace CRUD routes
  messages.ts    — message listing routes
  config.ts      — models, preconfigs, tools routes
  files.ts       — file listing and preview routes
```

Each route file exports a function that takes a Hono app and registers its routes:

```typescript
// src/routes/sessions.ts
export function registerSessionRoutes(app: Hono): void {
  app.get('/api/sessions', (c) => { ... });
  app.post('/api/sessions', (c) => { ... });
  // ...
}

// src/app.ts
import { registerSessionRoutes } from './routes/sessions';
import { registerWorkspaceRoutes } from './routes/workspaces';

export function createApp() {
  const app = new Hono();
  registerSessionRoutes(app);
  registerWorkspaceRoutes(app);
  return app;
}
```

**Why:** Each route group testable independently. `app.ts` becomes a thin orchestrator.
**Risk:** Low — mechanical move, no logic changes.
**Time:** 90 minutes.

### 5. Make `streamChatWithRetry` Accept a Stream Factory (DONE)

**What changed:**
- Extracted the huge inline return type into a named `StreamChatEvent` union type
- Added a `StreamChatFn` type alias for the stream factory signature
- Added optional `streamChatFn` parameter to `streamChatWithRetry()` with fallback to the existing dynamic import

```typescript
export type StreamChatEvent = MessageEvent | { type: 'usage'; ... } | ... ;
export type StreamChatFn = (options: ChatOptions) => AsyncGenerator<StreamChatEvent>;

export async function* streamChatWithRetry(
  options: ChatOptions,
  streamChatFn?: StreamChatFn,  // optional — tests inject, production uses default
): AsyncGenerator<StreamChatEvent> {
  const stream = streamChatFn ?? (await import('./agent')).streamChat;
  // ...
}
```

**Tests:** Rewrote `tests/core/retry.test.ts` — replaced `mock.module()` calls with clean dependency injection via `streamChatFn`. Same 6 test scenarios: success, retry-then-success, rate limit exhaustion, context overflow, server error exhaustion, non-retryable errors.

**Risk:** Low — backward compatible (parameter is optional, all existing callers unchanged).

### 6. Make `processCompactionTask` Accept a Summary Generator (DONE)

**What changed:**
- Extracted the entire LLM interaction (model resolution + `generateText`/`streamText` call) into a `defaultGenerateSummary` function
- Added `GenerateSummaryFn` interface — a high-level abstraction: `(prompt, policy) → { text, usage, effectiveModelId, effectiveProviderId }`
- Added optional `generateSummaryFn` parameter to `processCompactionTask()` with fallback to `defaultGenerateSummary`
- Renamed AI SDK imports to `aiGenerateText`/`aiStreamText` to avoid collision with local variables

```typescript
export interface GenerateSummaryFn {
  (prompt: string, policy: CompactionPolicy): Promise<{
    text: string;
    usage: { prompt: number; completion: number };
    effectiveModelId: string;
    effectiveProviderId: string;
  }>;
}

export async function processCompactionTask(
  sessionId: string,
  triggerMessageId: string,
  policy: CompactionPolicy,
  generateSummaryFn?: GenerateSummaryFn,  // optional — tests inject, production uses default
): Promise<CompactionTaskResult> {
  const generateSummary = generateSummaryFn ?? defaultGenerateSummary;
  const { text: summary, usage, effectiveModelId, effectiveProviderId } =
    await generateSummary(prompt, policy);
  // ...
}
```

**Tests:** Rewrote `tests/core/compaction.test.ts` — replaced `mock.module('@/core/model-utils')` + `createMockGenerateModel()` with clean DI via `generateSummaryFn`. Added new tests for effective model/provider recording and error propagation from the summary generator. Removed `mock.module('@/config')` since config is no longer hit by the test path.

**Removed from test:**
- `import { generateText } from 'ai'` (unused)
- `import { createMockGenerateModel } from '#tests/mocks'` (replaced by `createFakeGenerateSummary`)
- `mock.module('@/core/model-utils', ...)` (no longer needed)
- `mock.module('@/config', ...)` (no longer needed)

**Risk:** Low — backward compatible (parameter is optional, all existing callers unchanged).

### 7. Export Compaction Helpers from `compaction.ts` (DONE)

**What changed:** Added `export` to three private pure functions:
- `buildConversationText` — converts `MessageWithParts[]` into formatted text for LLM prompt
- `formatOutput` — truncates/serializes tool output for display (500-char limit)
- `estimateToolOutputSize` — cheap char-size estimation of tool output

**Tests:** 27 new unit tests in `tests/core/compaction-helpers.test.ts` covering:
- `formatOutput`: string truncation, object serialization, edge cases (null, number, boolean)
- `estimateToolOutputSize`: null/undefined → 0, string → length, object → JSON length, circular refs
- `buildConversationText`: system skip, user/assistant text, tool parts (completed/error/pending), ordering, long output truncation

**Risk:** Zero — just added exports, no behavior change.

### 8. Pass Broadcast Function as Parameter Instead of Global

**Current:** `broadcast.ts` uses a module-level callback:
```typescript
let broadcastCallback: BroadcastCallback | null = null;
export function registerBroadcastCallback(callback: BroadcastCallback): void { ... }
export function broadcastEvent(message: ServerMessage): void { ... }
```

This means any test that calls code which broadcasts needs to register a callback first, and tests can interfere with each other.

**Better pattern:** Functions that broadcast should accept a broadcast parameter:

```typescript
// Instead of:
export function persistCompactionFailure(sessionId, triggerMessageId, errorMessage) {
  // ... creates messages ...
  broadcastEvent({ type: 'message.created', ... }); // Uses global
}

// Prefer:
export function persistCompactionFailure(
  sessionId: string,
  triggerMessageId: string,
  errorMessage: string,
  broadcast: (msg: ServerMessage) => void = broadcastEvent, // Default to global
) {
  // ... creates messages ...
  broadcast({ type: 'message.created', ... });
}
```

**Why:** Tests can pass a capturing function. Production code uses the default.
**Risk:** Low — optional parameter with safe default.
**Time:** Incremental — do it as you test each function.

## Refactoring Order

```
Week 1: #1 + #2 (store test helpers)       ← 5 min, unlocks all store tests
Week 1: #7 (export compaction helpers)      ← DONE — 27 tests in compaction-helpers.test.ts
Week 1: #9 (centralized paths)              ← DONE — all paths go through paths.ts now
Week 2: #5 (inject stream factory)          ← DONE — retry tests use clean DI
Week 2: #6 (inject summary generator)      ← DONE — compaction tests use clean DI
Week 3: #3 (extract message router)         ← 60 min, unlocks integration tests
Week 4: #4 (split app.ts routes)            ← 90 min, unlocks route tests
Ongoing: #8 (broadcast injection)           ← incremental
```

## Golden Rule

Every refactoring should make the codebase **better tested**, not just **more testable**. Write the test that uses the new testability, verify it works, then commit both the refactoring and the test together.

### 9. Centralized Path Resolution (DONE)

**Problem:** `~/.jean2` was hardcoded via `join(homedir(), '.jean2', ...)` in 15+ files. Tests could not redirect paths, causing test data to leak into the production data directory.

**Solution:** Created `src/paths.ts` — a single module that resolves all data directory paths through `getDataDir()`. Tests override via `setDataDirForTesting()` / `resetDataDirForTesting()`.

**What changed:**
- `src/paths.ts` — new centralized module with all path functions
- `tests/helpers/test-dir.ts` — `setupTestDataDir()` / `resetTestDataDir()` helpers
- All consumers (`env.ts`, `config/index.ts`, `auth/token.ts`, `init.ts`, `app.ts`, `providers/storage.ts`, `mcp/auth.ts`, `core/instructions.ts`, `core/preconfig.ts`, `core/build-tools.ts`, `configuration/prompts.ts`, `configuration/provider-credentials.ts`, `configuration/tool-env.ts`, `daemon/index.ts`, `update.ts`) now import from `paths.ts`
- API tests use isolated temp directories instead of writing to `~/.jean2`
- Auth tests no longer backup/restore the real token file

**Usage in production code:**
```typescript
import { getAuthTokenPath, getPreconfigsDir } from '@/paths';
const tokenPath = getAuthTokenPath(); // Always resolves dynamically
```

**Usage in tests:**
```typescript
import { setupTestDataDir, resetTestDataDir } from '#tests/test-dir';

beforeEach(() => {
  setupTestDataDir();  // Creates temp dir, seeds models.json, clears caches
  setupTestDatabase();
});

afterEach(() => {
  resetTestDatabase();
  resetTestDataDir();  // Clears caches, removes temp dir
});
```

**Supported override methods (priority order):**
1. `setDataDirForTesting(dir)` — programmatic override for tests
2. `JEAN2_DATA_DIR` env var — for external test runners or CI
3. Default: `~/.jean2`
