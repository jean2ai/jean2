# 06 — Refactoring Guide

How to make existing code testable without breaking it. These are targeted, low-risk refactorings that unlock testability.

## Principles

1. **Never refactor without a test.** Write a failing test first, then refactor to make it pass.
2. **Small changes.** One refactoring per commit. Each should leave the codebase working.
3. **Extract, don't rewrite.** Pull logic out of big functions into small, testable ones.
4. **Dependency injection over mocking.** Pass dependencies as parameters instead of importing them directly.

## Refactoring Catalog

### 1. Export `initializeSchema` from `store/index.ts` (DONE)

**What changed:** Just added `export` to the function. No behavior change.

### 2. Add Test Helpers to `store/index.ts` (DONE → superseded by `DatabaseSingleton`)

**What changed:** Originally added `setDatabaseForTesting`/`resetDatabaseForTesting`. Later refactored into a `DatabaseSingleton` class with generic `DB.configure()`/`DB.reset()` APIs. Tests are just another consumer; no test-specific code in source.

### 3. Extract Message Router from `index.ts` (DONE)

**What changed:**
- Created `core/message-router.ts` — extracted all WS message handling logic from `index.ts`
- `handleClientMessage(ctx, ws, msg)` — main dispatcher for ~20 message types
- `RouterContext` interface — injects `send`, `broadcast`, and `clients` map
- All handler functions (`handleChat`, `handleSessionCompact`, `handleSessionRevert`, `handleSessionFork`, `runSingleChatTurn`, `drainQueue`, `findReplayText`) moved to the new module
- Compaction failure tracking (`shouldSkipCompaction`, `recordCompactionFailure`, `clearCompactionFailure`) moved to the new module
- `index.ts` reduced to ~420 lines — thin WS server orchestrator that creates `RouterContext` and delegates to `handleClientMessage`

**Before:**
```typescript
// index.ts (~1432 lines)
async function handleClientMessage(ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) { /* ... all handlers inline ... */ }
}
```

**After:**
```typescript
// core/message-router.ts (~1069 lines)
export async function handleClientMessage(ctx: RouterContext, ws: ServerWebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) { /* ... same handlers, using ctx.send/ctx.broadcast ... */ }
}

// index.ts (~420 lines)
const routerContext: RouterContext = { send, broadcast, clients };
// ...
await handleClientMessage(routerContext, ws, msg);
```

**Why:** Makes every message handler independently testable with injected broadcast/send. Unlocks integration tests that pass capturing functions instead of relying on global state.

**Risk:** Low — mechanical move, no logic changes. Functions use `ctx.send`/`ctx.broadcast` instead of closed-over `send`/`broadcast`.

### 4. Split `app.ts` Routes into Separate Files (DONE)

**What changed:**
- Created `src/routes/` directory with 6 route modules
- `app.ts` reduced from ~1466 lines to ~164 lines — thin orchestrator

```
src/routes/
  sessions.ts    — sessions + messages + attachments (230 lines)
  workspaces.ts  — workspaces + terminals + workspace sessions (235 lines)
  files.ts       — file browsing/preview/fs (127 lines)
  tools.ts       — tools + tool env vars (92 lines)
  mcp.ts         — MCP endpoints (127 lines)
  config.ts      — preconfigs + models + providers + config endpoints (481 lines)
```

Each route file exports a `registerXxxRoutes(app: Hono): void` function:

```typescript
// src/routes/sessions.ts
export function registerSessionRoutes(app: Hono): void {
  app.get('/api/sessions', async (c) => { ... });
  app.post('/api/sessions', async (c) => { ... });
  // ...
}

// src/app.ts
import { registerSessionRoutes } from '@/routes/sessions';
import { registerWorkspaceRoutes } from '@/routes/workspaces';
// ...

export function createApp() {
  const app = new Hono();
  registerSessionRoutes(app);
  registerWorkspaceRoutes(app);
  // ...
  return app;
}
```

**Route ordering note:** `/api/sessions/grouped` is registered in `sessions.ts` before `/api/sessions/:id` to prevent `:id` from matching "grouped".

**Why:** Each route group testable independently. `app.ts` becomes a thin orchestrator with only middleware and error handlers.

**Risk:** Low — mechanical move, no logic changes.

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

**Tests:** Rewrote `tests/core/retry.test.ts` — replaced `mock.module()` calls with clean dependency injection via `streamChatFn`. Same 6 test scenarios.

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
  // ...
}
```

**Tests:** Rewrote `tests/core/compaction.test.ts` — replaced `mock.module('@/core/model-utils')` + `createMockGenerateModel()` with clean DI via `generateSummaryFn`.

**Risk:** Low — backward compatible (parameter is optional, all existing callers unchanged).

### 7. Export Compaction Helpers from `compaction.ts` (DONE)

**What changed:** Added `export` to three private pure functions:
- `buildConversationText` — converts `MessageWithParts[]` into formatted text for LLM prompt
- `formatOutput` — truncates/serializes tool output for display (500-char limit)
- `estimateToolOutputSize` — cheap char-size estimation of tool output

**Tests:** 27 new unit tests in `tests/core/compaction-helpers.test.ts` covering all three functions.

**Risk:** Zero — just added exports, no behavior change.

### 8. Pass Broadcast Function as Parameter Instead of Global (DONE)

**What changed:**
Functions that call `broadcastEvent` / `broadcastSessionUpdated` now accept these as optional parameters with defaults pointing to the real implementations. Tests inject capturing functions; production callers pass nothing (using defaults).

**Exported types from `broadcast.ts`:**
```typescript
export type BroadcastFn = (message: ServerMessage) => void;
export type BroadcastSessionFn = (session: Session) => void;
```

**Refactored functions:**
| Function | New Parameters | File |
|---|---|---|
| `persistCompactionFailure` | `broadcast: BroadcastFn = broadcastEvent` | `compaction.ts` |
| `executeCompaction` | `broadcast: BroadcastFn = broadcastEvent`, `broadcastSessUpdate: BroadcastSessionFn = broadcastSessionUpdated` | `compaction-executor.ts` |
| `buildAiSdkTools` | Second param `broadcast: BroadcastFn = broadcastEvent` | `build-tools.ts` |
| `executeChildSession` | `broadcast?: BroadcastFn` in options | `child-session.ts` |
| `executeSubagent` | `broadcast?: BroadcastFn`, `broadcastSessionCreated?: BroadcastSessionFn`, `broadcastSessionUpdated?: BroadcastSessionFn` in input | `subagent.ts` |
| `reconcileSessionCompaction` | Uses existing `broadcast` option to create no-op fns when `false` | `compaction-recovery.ts` |

**Tests updated:**
- `tests/core/mocked/compaction-executor.test.ts` — removed `mock.module('@/core/broadcast')` (2 occurrences)
- `tests/core/mocked/build-tools.test.ts` — removed `mock.module('@/core/broadcast')`
- `tests/core/compaction.test.ts` — removed `mock.module('@/core/broadcast')`; `persistCompactionFailure` tests pass `broadcastFn` directly
- `tests/integration/message-handler.test.ts` — removed `mock.module('@/core/broadcast')`; uses `registerBroadcastCallback` instead

**Why:** Eliminates the need for `mock.module('@/core/broadcast')` across 4 test files. Functions are now independently testable with injected broadcast — no global state manipulation required.

**Risk:** Low — all new parameters are optional with safe defaults. All existing callers unchanged.

### 9. Centralized Path Resolution (DONE)

**What changed:**
- `src/paths.ts` — centralized module with all path functions via `PathsSingleton` class
- `tests/helpers/test-dir.ts` — `setupTestDataDir()` / `resetTestDataDir()` helpers
- All consumers now import from `paths.ts`
- API tests use isolated temp directories instead of writing to `~/.jean2`

**Usage in production code:**
```typescript
import { getAuthTokenPath, getPreconfigsDir } from '@/paths';
const tokenPath = getAuthTokenPath(); // Always resolves dynamically
```

**Usage in tests:**
```typescript
import { setupTestDataDir, resetTestDataDir } from '#tests/test-dir';

beforeEach(() => {
  setupTestDataDir();
  setupTestDatabase();
});

afterEach(() => {
  resetTestDatabase();
  resetTestDataDir();
});
```

## Refactoring Order

```
Week 1: #1 + #2 (store test helpers)       ← DONE (superseded by DatabaseSingleton)
Week 1: #7 (export compaction helpers)      ← DONE — 27 tests in compaction-helpers.test.ts
Week 1: #9 (centralized paths)              ← DONE — all paths go through paths.ts now
Week 2: #5 (inject stream factory)          ← DONE — retry tests use clean DI
Week 2: #6 (inject summary generator)      ← DONE — compaction tests use clean DI
Week 3: #3 (extract message router)         ← DONE — core/message-router.ts with RouterContext
Week 4: #4 (split app.ts routes)            ← DONE — src/routes/ with 6 modules
Week 5: #8 (broadcast injection)           ← DONE — all broadcast callers use DI
```

## Golden Rule

Every refactoring should make the codebase **better tested**, not just **more testable**. Write the test that uses the new testability, verify it works, then commit both the refactoring and the test together.
