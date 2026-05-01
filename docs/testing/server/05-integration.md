# 05 — Integration Tests

Integration tests verify that multiple modules work together correctly. These are harder to set up but catch the bugs that unit tests miss — the "wiring" bugs.

## What Integration Tests Cover

The main integration surface is the **WebSocket message flow** in `index.ts`:

```
Client sends WebSocket message
  → Server routes to handler
    → Handler calls core logic
      → Core logic uses store + external APIs
    → Server broadcasts events back to client
```

## Strategy: Test Message Handlers, Not the WebSocket

Don't try to spin up a real WebSocket server in tests. Instead, test the message handler logic directly by calling the same core functions that the handlers use, with a real in-memory database and captured broadcasts.

The handlers in `index.ts` currently handle these `ClientMessage` types:

| Message Type | Handler Logic |
|-------------|---------------|
| `chat.message` | Creates user message, starts streaming |
| `session.interrupt` | Interrupts active session |
| `session.compact` | Triggers manual compaction |
| `session.revert` | Reverts to earlier message |
| `session.fork` | Forks session at message |
| `ask.response` | Resolves pending ask |
| `permission.grant` | Grants tool permission |
| `queue.add` | Adds message to queue |

### Approach: Test Core Functions + Broadcasts + DB State

Since the handlers are private functions in `index.ts` (tightly coupled to `ServerWebSocket` and the module-level `clients` map), integration tests call the underlying core functions directly:

1. **Real in-memory DB** via `setupTestDatabase()`
2. **Captured broadcasts** via `createMockBroadcast()` + `registerBroadcastCallback()`
3. **Real core functions**: `executeCompaction`, `revertToStep`, `forkSession`, `interruptManager`, etc.
4. **Verify**: DB state (messages, sessions, queues) + broadcast message sequences

This gives integration coverage without needing the refactoring step. The planned `core/message-router.ts` extraction (item #3 in `06-refactoring-guide.md`) will make these tests even more direct by testing the handler functions themselves.

### Test File

All integration tests live in:
```
packages/server/tests/integration/message-handler.test.ts
```

## Key Integration Scenarios Tested

### 1. Session Lifecycle (7 tests)
- `session.create` → DB persists session with correct fields
- `session.close` → status updated to 'closed' in DB
- `session.reopen` → status updated back to 'active'
- `session.delete` → session removed from DB
- `session.rename` → title updated in DB
- `session.rename` with empty title → validation check
- `session.update_model` → selectedModel/provider updated

### 2. Compaction Flow (4 tests)
- Manual compaction completes full cycle: trigger → LLM summary → summary message → compacted tools
- Compaction fails for child session (parentId set) → skipped error
- Compaction on empty session → error
- Compaction broadcasts `session.updated` with compacting=true/false transitions

### 3. Revert Flow (3 tests)
- Revert deletes messages after target, broadcasts state
- Revert to first message clears all messages
- Revert throws for nonexistent target message

### 4. Fork Flow (3 tests)
- Fork creates new session with copied messages up to target
- Fork copies tool parts along with messages
- Fork throws for nonexistent source session

### 5. Interrupt Flow (4 tests)
- Interrupt aborts session and tool controllers
- Interrupt marks subagent session as interrupted
- Interrupt on unregistered session returns success
- `isSessionActive` changes after interrupt

### 6. Queue Flow (5 tests)
- Add message to queue and retrieve
- Queue maintains FIFO order
- List queued messages returns all for session
- Delete queued message removes it
- Queue is session-scoped

### 7. Ask/Response Flow (2 tests)
- Create ask → broadcasts `ask.request` → resolve → returns response value
- Permission ask with matching grant → auto-grants without broadcasting

### 8. Permission Flow (3 tests)
- List permissions returns workspace grants
- Revoke grant removes it from active grants
- Revoke all workspace grants

### 9. Session Resume (2 tests)
- Resume returns session messages with correct roles
- Resume returns queued messages in order

## Mocking Strategy

Integration tests mock only the external boundaries:

| Module | Mock | Why |
|--------|------|-----|
| `@/core/broadcast` | Captures broadcast messages | Verify correct ServerMessage sequences |
| `@/core/model-utils` | Returns `MockLanguageModelV3` | Avoid real LLM API calls during compaction |
| `@/config` | Returns static config | Avoid filesystem reads for models.json |
| `@/env` | Returns static env values | Avoid real env var dependencies |

All store functions (`createSession`, `createMessage`, `addMessageToQueue`, etc.) use the **real in-memory database** — no mocking.

## Test Helpers Used

| Helper | Purpose |
|--------|---------|
| `setupTestDatabase()` / `resetTestDatabase()` | In-memory SQLite with schema |
| `setupTestDataDir()` / `resetTestDataDir()` | Temp directory for path resolution |
| `seedWorkspaceWithSession()` | Creates workspace + session in one call |
| `createMockBroadcast()` | Captures all broadcast messages |
| `createMockWs()` | Mock ServerWebSocket for WS-level tests (future) |

## Test Counts

| Scenario | Tests | Status |
|----------|-------|--------|
| Session lifecycle | 7 | ✅ |
| Compaction flow | 4 | ✅ |
| Revert flow | 3 | ✅ |
| Fork flow | 3 | ✅ |
| Interrupt flow | 4 | ✅ |
| Queue flow | 5 | ✅ |
| Ask/response flow | 2 | ✅ |
| Permission flow | 3 | ✅ |
| Session resume | 2 | ✅ |
| **Total** | **33** | **All passing** |

Total test count across project: **528 tests, 0 failures**.

## Future: Full Chat Send Flow

The most complex integration scenario — the full `chat.message` → `streamChat` → broadcast pipeline — is not yet tested at the integration level. This requires:

1. Mocking `streamChatWithRetry` to yield controlled events
2. Verifying the exact broadcast sequence (message.created → part.created → usage → message.updated)
3. Testing context overflow → auto-compaction → retry cycle
4. Testing queue drain after stream completion

This is planned for after the `core/message-router.ts` extraction refactoring.

## Refactoring for Testability (Future)

The planned refactoring extracts handlers from `index.ts`:

```typescript
// src/core/message-router.ts (future)

export interface MessageHandlerContext {
  broadcast: (message: ServerMessage, excludeWs?: unknown) => void;
  getSession: typeof getSession;
  createSession: typeof createSession;
}

export async function handleChatSend(
  sessionId: string,
  content: string,
  attachments: Array<{ id: string; kind: string }>,
  ctx: MessageHandlerContext,
): Promise<void> {
  // Logic currently in index.ts chat.send handler
}
```

Once extracted, integration tests can call handlers directly with a mock context instead of calling individual core functions. The current tests will serve as regression safety during that refactoring.
