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

### 5. Make `streamChatWithRetry` Accept a Stream Factory

**Current:**
```typescript
// core/retry.ts
const { streamChat } = await import('./agent');
for await (const event of streamChat(options)) {
  yield event;
}
```

**After:**
```typescript
export interface StreamChatFn {
  (options: ChatOptions): AsyncGenerator<...>;
}

export async function* streamChatWithRetry(
  options: ChatOptions,
  streamChatFn?: StreamChatFn,
): AsyncGenerator<...> {
  const stream = streamChatFn ?? (await import('./agent')).streamChat;
  // ...
}
```

**Why:** Tests can pass a mock `streamChatFn` instead of dealing with dynamic imports.
**Risk:** Low — backward compatible (parameter is optional).
**Time:** 10 minutes.

### 6. Make `processCompactionTask` Accept AI SDK Function

**Current:**
```typescript
import { generateText, streamText } from 'ai';
// Direct usage in processCompactionTask
```

**After:**
```typescript
export interface CompactionLLM {
  generateText: typeof import('ai').generateText;
  streamText: typeof import('ai').streamText;
}

export async function processCompactionTask(
  sessionId: string,
  triggerMessageId: string,
  policy: CompactionPolicy,
  llm?: CompactionLLM,
): Promise<CompactionTaskResult> {
  const { generateText: genText, streamText: strText } = llm ?? await import('ai');
  // Use genText/strText instead of direct imports
}
```

**Why:** Tests can pass a fake LLM that returns canned summaries.
**Risk:** Low — optional parameter with fallback.
**Time:** 15 minutes.

### 7. Extract `buildConversationText` and `formatOutput` from `compaction.ts`

These are private pure functions that are hard to test. Export them:

```typescript
// Before:
function buildConversationText(messages: MessageWithParts[]): string { ... }
function formatOutput(output: unknown): string { ... }
function estimateToolOutputSize(output: unknown): number { ... }

// After:
export function buildConversationText(messages: MessageWithParts[]): string { ... }
export function formatOutput(output: unknown): string { ... }
export function estimateToolOutputSize(output: unknown): number { ... }
```

**Why:** These contain complex formatting logic that deserves direct testing.
**Risk:** Zero — just adding exports.
**Time:** 30 seconds each.

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
Week 1: #7 (export compaction helpers)      ← 2 min, unlocks compaction tests
Week 2: #5 + #6 (inject dependencies)       ← 25 min, unlocks retry/compaction mocking
Week 3: #3 (extract message router)         ← 60 min, unlocks integration tests
Week 4: #4 (split app.ts routes)            ← 90 min, unlocks route tests
Ongoing: #8 (broadcast injection)           ← incremental
```

## Golden Rule

Every refactoring should make the codebase **better tested**, not just **more testable**. Write the test that uses the new testability, verify it works, then commit both the refactoring and the test together.
