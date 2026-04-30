# Server Testing Handbook

A practical guide for bringing test coverage to `@jean2/server`.

## Why This Exists

The server has **88 TypeScript source files** and **zero tests**. Every change is a leap of faith. This handbook is the plan to fix that, one focused module at a time.

## Test Runner

**Use `bun:test`** — not Vitest. The server runs on Bun in production and uses Bun-specific APIs (`bun:sqlite`, `Bun.file`, `Bun.serve`). Matching the test runner to the runtime eliminates "works in tests, fails in production" bugs.

## Documents

Read these in order:

1. **[00-foundation.md](./00-foundation.md)** — Set up `bun:test`, directory structure, scripts, CI, AI SDK mocking. Do this first.
2. **[01-pure-utils.md](./01-pure-utils.md)** — Test the easiest modules first. No DB, no mocking. Quick wins.
3. **[02-store-layer.md](./02-store-layer.md)** — Test the data layer against real SQLite. Highest ROI.
4. **[03-core-logic.md](./03-core-logic.md)** — Test the agent brain: compaction, messages, retries.
5. **[04-api-routes.md](./04-api-routes.md)** — Test REST endpoints using Hono's test helpers.
6. **[05-integration.md](./05-integration.md)** — Test WebSocket message flows end-to-end.
7. **[06-refactoring-guide.md](./06-refactoring-guide.md)** — How to make existing code testable without breaking it.

## Workflow for Every Bug

```
1. Write a FAILING test that reproduces the bug
2. Run test → confirm it fails
3. Fix the code
4. Run test → confirm it passes
5. The test stays forever → regression prevented
```

## Current State

| Metric | Value |
|--------|-------|
| Total source files | 88 |
| Test files | 15 (416 tests, 884 assertions) |
| Test helper files | 4 (db, factories, mocks with AI SDK mock models, seed) |
| AI SDK mocking | ✅ `MockLanguageModelV3` from `ai/test`, wrapped in `#tests/mocks` helpers |
| CI test steps | Not yet added to GitHub workflows |

## Module Complexity Map

```
CRITICAL (test first):
  core/compaction.ts         622 lines  — most complex pure logic
  store/messages.ts          671 lines  — all message CRUD + context building
  index.ts                   ~500 lines — WebSocket message router
  app.ts                     ~500 lines — REST API endpoints

HIGH (test second):
  core/agent.ts              401 lines  — streaming agent loop
  core/subagent.ts           364 lines  — subagent spawning
  core/preconfig.ts          328 lines  — preconfig CRUD
  store/index.ts             330 lines  — schema + migrations
  store/sessions.ts          311 lines  — session lifecycle
  tools/executor.ts          266 lines  — tool execution sandbox
  core/message-utils.ts      251 lines  — message format conversion
  store/permissions.ts       398 lines  — permission matching

MEDIUM (test third):
  env.ts                     246 lines  — config getters (all pure functions)
  core/retry.ts              81 lines   — retry with error classification
  core/stream-handlers.ts    148 lines  — stream delta handlers
  core/build-tools.ts        151 lines  — AI SDK tool builder
  core/compaction-executor.ts 141 lines — compaction orchestrator
  core/interrupt.ts          138 lines  — abort cascade
  core/fork.ts               111 lines  — session fork
  core/revert.ts             73 lines   — session revert
  utils/truncate-tool-result.ts  66 lines — result truncation
  utils/strip-visualization.ts   51 lines — visualization stripping
  utils/binaryDetection.ts       118 lines — binary detection
  utils/errors.ts            199 lines  — error classification
```
