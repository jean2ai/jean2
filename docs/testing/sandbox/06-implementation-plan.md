# 06 — Implementation Plan

The phased build plan with milestones, dependencies, and acceptance criteria. Each phase produces a working, testable increment.

## Phase Overview

```
Phase 1: Core Engine           ← No UI, just the sandbox provider + controller
Phase 2: Server Integration    ← Wire into server, test with curl
Phase 3: DI Refactoring        ← Clean up model resolution
Phase 4: Control API           ← REST + WebSocket endpoints
Phase 5: Sandbox CLI           ← Standalone CLI tool for interactive control
Phase 6: Scripted Tests        ← Test utilities + first batch of tests
Phase 7: Polish & CI           ← Auto-responders, edge cases, CI pipeline
```

## Phase 1: Core Engine

**Goal**: The `SandboxLanguageModel`, `SandboxController`, and `SandboxProvider` exist and work in isolation.

**Duration**: 2-3 days

### Tasks

- [ ] Create `src/sandbox/types.ts` — `SandboxResponse`, `LlmCallContext`, `AutoResponderRule`, control protocol types
- [ ] Create `src/sandbox/controller.ts` — `SandboxController` class with `waitForResponse()`, `respond()`, `complete()`, history tracking
- [ ] Create `src/sandbox/model.ts` — `SandboxLanguageModel` implementing `LanguageModelV3` with `doStream()` and `doGenerate()`
- [ ] Create `src/sandbox/provider.ts` — `SandboxProvider` implementing `ConnectableProvider`
- [ ] Create `src/sandbox/index.ts` — `activateSandbox()`, `deactivateSandbox()`, `isSandboxActive()`

### Acceptance Criteria

- [ ] `SandboxLanguageModel.doStream()` blocks until `controller.respond()` is called
- [ ] `SandboxLanguageModel.doStream()` correctly converts each `SandboxResponse` type to AI SDK streaming deltas
- [ ] `SandboxLanguageModel.doGenerate()` blocks and returns correct response format
- [ ] `SandboxProvider.createModel()` returns a `SandboxLanguageModel` instance
- [ ] `SandboxController` tracks history and pending calls correctly
- [ ] Write unit tests for `SandboxController` (respond, history, pending, auto-respond matching)
- [ ] Write unit tests for `SandboxLanguageModel` (response → delta conversion for each type)

### Key Files to Read Before Starting

- `packages/server/src/providers/registry.ts` — the `ConnectableProvider` interface
- `packages/server/tests/helpers/mocks.ts` — existing `createMockStreamModel`, `createMockToolCallModel` (reference delta formats)
- `packages/server/src/core/model-utils.ts` — where `getModelWithMetadata()` is called

### Dependencies

None. This phase is pure new code.

---

## Phase 2: Server Integration

**Goal**: Start the server in sandbox mode. Verify that real chat messages trigger the sandbox model and block correctly.

**Duration**: 1-2 days

### Tasks

- [ ] Add `JEAN2_SANDBOX` env var check to `src/index.ts`
- [ ] Import and call `activateSandbox()` when env var is set
- [ ] Do **Refactoring #12**: Route provider ID to `'sandbox'` when sandbox is active
- [ ] Start server in sandbox mode manually
- [ ] Send a chat message via WebSocket
- [ ] Verify server blocks (no LLM response comes back)
- [ ] Manually call `controller.respond()` via debugger or internal API
- [ ] Verify response flows through to client

### Acceptance Criteria

- [ ] `JEAN2_SANDBOX=true bun run dev:server` starts without error
- [ ] Sending a chat message causes the server to block (no crash, no timeout)
- [ ] The `SandboxController` has the pending call in its queue
- [ ] Calling `controller.respond()` with a text response causes the message to appear in the client
- [ ] Calling `controller.respond()` with a tool call causes the tool to execute
- [ ] Multi-step works: tool call → tool result → follow-up LLM call → text response

### Key Files to Change

- `src/index.ts` — add sandbox activation (~10 lines)
- `src/core/message-router.ts` — route provider to 'sandbox' (~3 lines)

### Dependencies

- Phase 1 complete

---

## Phase 3: DI Refactoring

**Goal**: Clean up the model resolution chain so `sessionId` flows through to `SandboxProvider`.

**Duration**: 1 day

### Tasks

- [ ] **Refactoring #11**: Add `sessionId` to `ModelFactoryOptions` in `providers/registry.ts`
- [ ] **Refactoring #10**: Convert `getModelWithMetadata()` from 3 positional params to options object
- [ ] Update all call sites:
  - `agent.ts` — pass `sessionId`
  - `compaction.ts` — update call signature
  - `tools/llm-api.ts` — update call signature
- [ ] Run `bun run typecheck` — must pass
- [ ] Run `bun run lint` — must pass
- [ ] Run `bun test` — all existing tests must still pass
- [ ] Verify sandbox still works from Phase 2

### Acceptance Criteria

- [ ] `getModelWithMetadata()` accepts an options object with `sessionId`
- [ ] `ModelFactoryOptions` includes `sessionId`
- [ ] `SandboxProvider.createModel()` receives the session ID
- [ ] `SandboxLanguageModel` can compute depth from session hierarchy
- [ ] All 528+ existing tests pass unchanged
- [ ] `bun run typecheck` passes
- [ ] Manual sandbox test from Phase 2 still works

### Key Files to Change

- `src/providers/registry.ts` — add `sessionId` to `ModelFactoryOptions`
- `src/core/model-utils.ts` — convert to options object
- `src/core/agent.ts` — update call site
- `src/core/compaction.ts` — update call site
- `src/tools/llm-api.ts` — update call site

### Dependencies

- Phase 2 complete (we need a working sandbox to verify the refactoring doesn't break it)

---

## Phase 4: Control API

**Goal**: REST + WebSocket endpoints for controlling the sandbox. Testable with `curl`.

**Duration**: 2-3 days

### Tasks

- [ ] Create `src/sandbox/routes.ts` — all REST endpoints
- [ ] Register routes in `src/app.ts` (conditional on sandbox mode)
- [ ] Add WebSocket message handling for `sandbox.respond` in `message-router.ts`
- [ ] Implement auto-responder system in `SandboxController`
- [ ] Test all endpoints with `curl`

### Acceptance Criteria

- [ ] `GET /api/sandbox/status` returns `{ active: true, pendingCallCount: N }`
- [ ] `GET /api/sandbox/pending` returns array of pending `LlmCallContext`
- [ ] `POST /api/sandbox/pending/:id/respond` with text response unblocks the server
- [ ] `POST /api/sandbox/pending/:id/respond` with tool call triggers real tool execution
- [ ] `POST /api/sandbox/pending/:id/respond` with error triggers retry logic
- [ ] `GET /api/sandbox/history` returns full interaction history
- [ ] `DELETE /api/sandbox/history` clears history
- [ ] `PUT /api/sandbox/auto-responder` sets rules
- [ ] Auto-responder correctly matches and auto-responds compaction calls
- [ ] WebSocket `sandbox.call_waiting` events are sent when LLM blocks
- [ ] WebSocket `sandbox.respond` message works as alternative to REST

### Manual Test Script

```bash
# Start sandbox
JEAN2_SANDBOX=true bun run dev:server &

# Check status
curl http://localhost:3000/api/sandbox/status

# Send a chat message (via wscat or similar)
# ... trigger a chat ...

# See pending calls
curl http://localhost:3000/api/sandbox/pending

# Respond with text
curl -X POST http://localhost:3000/api/sandbox/pending/CALL_ID/respond \
  -H 'Content-Type: application/json' \
  -d '{"type":"text","content":"Hello from sandbox!"}'

# Check history
curl http://localhost:3000/api/sandbox/history
```

### Dependencies

- Phase 2 complete (server integration)

---

## Phase 5: Sandbox CLI

**Goal**: Standalone CLI tool for interactive sandbox control. Zero changes to client or SDK.

**Duration**: 2-3 days

### Tasks

- [ ] Create `packages/sandbox-cli/package.json` — standalone package (`@jean2/sandbox-cli`, depends on `@jean2/sdk` for types)
- [ ] Create `packages/sandbox-cli/src/types.ts` — re-export or duplicate the small subset of sandbox protocol types needed
- [ ] Create `packages/sandbox-cli/src/api-client.ts` — HTTP + WebSocket client for the control API
- [ ] Create `packages/sandbox-cli/src/display.ts` — terminal formatting (pending calls, history, notifications)
- [ ] Create `packages/sandbox-cli/src/commands.ts` — command parsing and execution (respond, pending, history, call, auto-respond, status, clear, help)
- [ ] Create `packages/sandbox-cli/src/cli.ts` — entry point, argument parsing, REPL loop, real-time notifications
- [ ] Add `sandbox` script to root `package.json`: `bun packages/sandbox-cli/src/cli.ts`
- [ ] Test full workflow: start sandbox server → start client → start CLI → drive LLM from CLI

### Acceptance Criteria

- [ ] `bun packages/sandbox-cli/src/cli.ts --port 3000` connects and shows status
- [ ] CLI receives real-time notifications when LLM calls block (`sandbox.call_waiting`)
- [ ] `respond <id> text "..."` sends text response and unblocks server
- [ ] `respond <id> tool-call read-file '{"path":"..."}'` triggers real tool execution
- [ ] `respond <id> error "..."` triggers error handling
- [ ] `respond text "..."` (no ID) responds to most recent pending call
- [ ] `pending` / `p` shows all waiting calls with context
- [ ] `history` / `h` shows completed interactions
- [ ] `call <id>` shows full message context for a specific call
- [ ] `auto-respond mode:generate "Summary..."` sets auto-responder rules
- [ ] `status` / `s` shows sandbox state
- [ ] `clear` clears history
- [ ] `help` shows available commands
- [ ] Shorthand aliases work: `r t "..."`, `r tc toolName '{}'`, `p`, `h`, `s`
- [ ] Client works completely normally — zero changes to client code
- [ ] CLI is a standalone package (`@jean2/sandbox-cli`) that can optionally depend on `@jean2/sdk` for types

### Key Design Decision

The CLI lives in `packages/sandbox-cli/` — a standalone package in the monorepo, following the same pattern as `packages/client-electron` and `packages/client-tauri`. It talks to the server's control API via HTTP and WebSocket. This means:
- **Zero changes to client** — you're testing the real, unmodified client
- **Zero changes to SDK** — no sandbox namespace needed
- **No React/Zustand/TanStack deps** — just a Bun script
- **CI-ready** — the same API the CLI uses is what test scripts use
- **Proper package isolation** — own `package.json`, own dependencies, can depend on `@jean2/sdk` for types

### Dependencies

- Phase 4 complete (control API)

---

## Phase 6: Scripted Tests

**Goal**: Test utilities for programmatic sandbox control. First batch of automated tests.

**Duration**: 3-5 days

### Tasks

- [ ] Create `tests/sandbox/helpers/sandbox-server.ts` — start/stop sandbox server process
- [ ] Create `tests/sandbox/helpers/sandbox-client.ts` — `createSandbox()` client
- [ ] Create `tests/sandbox/helpers/sdk-client.ts` — SDK client wrapper
- [ ] Create `tests/sandbox/helpers/sandbox-assertions.ts` — assertion helpers
- [ ] Write first test: `simple-text-chat.test.ts`
- [ ] Write: `tool-execution.test.ts`
- [ ] Write: `permission-deny.test.ts`
- [ ] Write: `subagent-spawn.test.ts`
- [ ] Write: `error-retry.test.ts`

### Acceptance Criteria

- [ ] `createSandbox()` connects to sandbox server via control API
- [ ] `sandbox.next()` correctly waits for and returns pending calls
- [ ] `call.text()`, `call.toolCall()`, `call.error()` convenience methods work
- [ ] `sandbox.next({ filter: { depth: 1 } })` correctly filters subagent calls
- [ ] `sandbox.setAutoResponders()` correctly auto-responds matched calls
- [ ] At least 5 test files pass reliably
- [ ] Tests run in under 30 seconds total
- [ ] Tests can run concurrently without interference

### Dependencies

- Phase 4 complete (control API)

---

## Phase 7: Polish & CI

**Goal**: Production-quality sandbox with CI integration, edge case handling, and comprehensive test coverage.

**Duration**: 3-5 days

### Tasks

- [ ] Handle edge cases:
  - [ ] Concurrent sessions with interleaved calls
  - [ ] Sandbox timeout (prevent infinite hangs)
  - [ ] Server shutdown while calls are pending
  - [ ] WebSocket reconnection for control channel
- [ ] Write remaining test files:
  - [ ] `compaction.test.ts`
  - [ ] `interrupt.test.ts`
  - [ ] `multi-session.test.ts`
  - [ ] `ask-response.test.ts`
  - [ ] `edge-cases.test.ts`
- [ ] Add GitHub Actions workflow for sandbox tests
- [ ] Add sandbox documentation to README
- [ ] Update `docs/testing/server/README.md` with sandbox section
- [ ] Add sandbox test count to metrics

### Acceptance Criteria

- [ ] All edge cases handled gracefully (no server crashes)
- [ ] 10+ sandbox test files with 50+ test cases
- [ ] All tests pass in CI (GitHub Actions)
- [ ] CI pipeline runs in under 5 minutes
- [ ] Documentation is complete and accurate
- [ ] `bun run typecheck` and `bun run lint` pass

### Dependencies

- Phase 5 and Phase 6 complete

---

## Dependency Graph

```
Phase 1: Core Engine
    │
    ▼
Phase 2: Server Integration
    │
    ├──► Phase 3: DI Refactoring
    │
    ├──► Phase 4: Control API
    │        │
    │        ├──► Phase 5: Sandbox CLI
    │        │
    │        └──► Phase 6: Scripted Tests ──► Phase 7: Polish & CI
    │
    └───────────────────────────────────────────────────────────►
```

Phases 3, 5, and 6 can partially overlap. Phase 3 is a refactoring that should be done early but isn't blocking Phase 4+. Phases 5 (CLI) and 6 (tests) are independent of each other and can run in parallel.

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 1: Core Engine | 2-3 days | 2-3 days |
| Phase 2: Server Integration | 1-2 days | 3-5 days |
| Phase 3: DI Refactoring | 1 day | 4-6 days |
| Phase 4: Control API | 2-3 days | 6-9 days |
| Phase 5: Sandbox CLI | 2-3 days | 8-12 days |
| Phase 6: Scripted Tests | 3-5 days | 11-17 days |
| Phase 7: Polish & CI | 3-5 days | 14-22 days |

**Minimum viable sandbox** (Phases 1-4): ~1.5 weeks
**Full interactive sandbox** (Phases 1-5): ~2 weeks
**Complete with tests and CI** (Phases 1-7): ~3 weeks

## What You Get at Each Phase

### After Phase 1
A mock LLM that blocks and responds to programmatic input. No server integration yet. Testable in isolation via unit tests.

### After Phase 2
A server that starts in sandbox mode. Chat messages block until you respond via debugger or internal API. Proves the architecture works.

### After Phase 3
Clean model resolution with session ID threading. The foundation for proper DI throughout the server.

### After Phase 4
A fully controllable server via `curl`. You can test any flow manually by hitting REST endpoints. This is already useful for debugging.

### After Phase 5
A standalone CLI tool. Developers can test behaviors in real-time by typing commands in their terminal. The client works completely normally — zero changes needed. No API knowledge required.

### After Phase 6
Automated test suite that runs full pipeline tests. CI integration. Regression protection.

### After Phase 7

Production-quality sandbox with edge case handling, comprehensive coverage, and CI pipeline. The entire server's behavioral surface is testable without a real LLM. The client remains completely untouched.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AI SDK V3 delta format changes | Sandbox breaks | Pin AI SDK version; existing mocks are already working reference |
| `doStream`/`doGenerate` signature mismatch | Model doesn't work | Test against actual AI SDK `streamText`/`generateText` in Phase 1 |
| Multi-step loop doesn't re-call model | No follow-up after tool call | Verify in Phase 2 that tool result triggers another `doStream` call |
| Concurrent sessions cause race conditions | Tests flake | Use session-scoped filtering; add mutex to controller if needed |
| WebSocket control messages lost | Responses don't arrive | REST API as fallback; retry logic in test client |
| Provider registry doesn't support 'sandbox' ID | Model not resolved | Already supported — registry is a simple Map<string, ConnectableProvider> |

## Success Metrics

| Metric | Target |
|--------|--------|
| New production code changed | < 50 lines |
| New sandbox code (server) | ~620 lines |
| New sandbox CLI code | ~400 lines |
| Test helper code | ~400 lines |
| Sandbox test files | 10+ |
| Sandbox test cases | 50+ |
| Client/SDK changes | 0 |
| Time to test a permission flow | < 10 seconds (scripted) |
| Time to test a subagent flow | < 15 seconds (scripted) |
| CI pipeline overhead | < 2 minutes |
| Flaky test rate | < 1% |
