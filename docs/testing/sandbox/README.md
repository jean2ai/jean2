# Sandbox Testing Handbook

A comprehensive strategy for building an interactive, LLM-free testing sandbox for `@jean2/server`.

## Why This Exists

The server has solid unit test coverage for store, utils, core logic, and API routes (528+ tests). But the most critical paths — the ones that cost the most when they break — remain untested because they require a real LLM:

- **Full chat loop**: user message → streaming → tool calls → broadcasts → message persistence
- **Permission enforcement**: tool execution → permission check → grant/deny → retry
- **Subagent orchestration**: task spawning → child session → depth limits → cascading interrupts
- **Compaction triggers**: context overflow → auto-compaction → summary → context rebuild
- **Error recovery**: rate limits → retry with backoff → fallback behavior
- **Ask/response flow**: tool asks user → permission request → user responds → tool resumes

Every one of these bugs you only discover in production. The sandbox eliminates that gap.

## What the Sandbox Is

A **mode** where the server runs normally — same WebSocket handling, same message routing, same tool execution, same store, same broadcasts — but instead of a real LLM responding, **you** control what the LLM says.

```
┌─────────────┐         ┌──────────────────┐         ┌───────────────┐
│  Client     │         │  Server          │         │  Sandbox CLI  │
│  (ZERO      │── WS ──▶│  (sandbox mode)  │◀─ HTTP ─│  (separate)   │
│   changes)  │         │                  │         │               │
│             │◀─ WS ──│  Control API     │◀─ WS ──│  Terminal UI  │
│  Works      │         │  /api/sandbox/*  │         │  Commands     │
│  normally   │         │                  │         │  Scripts      │
└─────────────┘         └──────────────────┘         └───────────────┘
```

**The client is completely untouched.** It connects, sends messages, receives broadcasts — unaware that the server is in sandbox mode. The CLI is a separate process that drives the LLM through the control API.

This is critical: you're testing the real client experience. No sandbox code in the client, no conditional rendering, no special code paths. The client works exactly as it does in production.

Two modes of operation:

1. **Interactive**: You manually drive the "LLM" through a CLI. Type commands to make it call a tool, send a text response, trigger an error. Test behaviors in real-time from your terminal.

2. **Scripted**: A test script programmatically drives the "LLM" through the same control API. Assertions verify DB state, broadcast sequences, permission grants. Full CI integration.

Both modes share the same control API. The CLI is a human-friendly wrapper around it.

## Documents

Read these in order:

1. **[01-architecture.md](./01-architecture.md)** — How the sandbox plugs into the existing server. The call chain, the provider registry, the interception points.
2. **[02-sandbox-provider.md](./02-sandbox-provider.md)** — The core engine: the interactive `LanguageModelV3` implementation, the `SandboxController`, the response format.
3. **[03-interactive-control.md](./03-interactive-control.md)** — The control API (REST + WebSocket), the standalone CLI tool, the developer experience.
4. **[04-scripted-tests.md](./04-scripted-tests.md)** — `createSandboxClient()`, programmatic test scripts, assertion helpers, CI integration.
5. **[05-di-refactoring.md](./05-di-refactoring.md)** — The dependency injection changes needed to make the sandbox clean (no `mock.module()`).
6. **[06-implementation-plan.md](./06-implementation-plan.md)** — Phased build plan with milestones, dependencies, and acceptance criteria.

## Relationship to Existing Test Strategy

The sandbox builds on the testing foundation established in `docs/testing/server/`:

| Doc | Status | What It Covers |
|-----|--------|---------------|
| `00-foundation` | ✅ Done | `bun:test`, test helpers, AI SDK mocking, directory structure |
| `01-pure-utils` | ✅ Done | Utility function testing |
| `02-store-layer` | ✅ Done | SQLite CRUD testing |
| `03-core-logic` | ✅ Done | Core logic unit testing |
| `04-api-routes` | ✅ Done | Hono route testing |
| `05-integration` | ✅ Done | Cross-module integration testing |
| `06-refactoring-guide` | ✅ Done | DI refactoring catalog |
| **Sandbox docs** | 🎯 Planned | **Full-pipeline interactive testing** |

The sandbox is the natural next step. Unit tests cover individual functions. Integration tests cover module boundaries. The sandbox covers **entire behavioral flows** — the same scenarios that users encounter, but without the cost and non-determinism of a real LLM.

## Key Design Principles

1. **The server doesn't know it's in sandbox mode.** The sandbox provider is just another `ConnectableProvider`. The agent, message router, tool executor, and store all run their real code paths.

2. **The client doesn't change at all.** Zero lines of code modified in `@jean2/client` or `@jean2/sdk`. The sandbox is an external tool that talks to the server's control API. This means you're testing the real client experience.

3. **No `mock.module()`.** The sandbox is activated via a registered provider, not via module interception. This means the sandbox exercises real import chains, real initialization, real code.

4. **The blocking point is minimal.** Only `LanguageModel.doStream()` and `doGenerate()` block waiting for input. Everything else runs at full speed.

5. **Interactive and scripted share the same API.** Whether you're typing in the CLI or writing a test script, you're using the same control endpoints. No divergent code paths.

6. **DI refactors pay double.** Every change made to support the sandbox is the same change needed for proper unit testing. The sandbox is the forcing function for better architecture.
