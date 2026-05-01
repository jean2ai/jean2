# 01 — Architecture

How the sandbox plugs into the existing server. Every interception point, every coupling, every extension point — mapped precisely to the current codebase.

## The Current LLM Call Chain

When a user sends a message, here's the exact path the request takes through the codebase:

```
1. Client sends WebSocket message: { type: "chat.message", sessionId, content }
     │
     ▼
2. index.ts:60 — Bun.serve websocket.message handler
     │  ws.onmessage → handleClientMessage(routerContext, ws, msg)
     │
     ▼
3. message-router.ts:60 — handleClientMessage(ctx, ws, msg)
     │  Switch on msg.type → calls handleChat()
     │
     ▼
4. message-router.ts:159 — runSingleChatTurn(ctx, ws, sessionId, content, ...)
     │  Creates user message in DB, broadcasts message.created
     │  Builds context history via buildEffectiveContextHistory()
     │  Creates askBroadcastFn for permission routing
     │
     ▼
5. message-router.ts:238 — streamChatWithRetry({ sessionId, preconfig, messages, ... })
     │
     ▼
6. retry.ts:21 — streamChatWithRetry(options)
     │  Resolves streamChat via dynamic import: (await import('./agent')).streamChat
     │  Wraps in try/catch for retry logic (max 3 retries, exponential backoff)
     │
     ▼
7. agent.ts:72 — streamChat(options: ChatOptions): AsyncGenerator
     │  ├── Registers session with interruptManager
     │  ├── Initializes MCP for workspace (if applicable)
     │  ├── Resolves model: modelId || preconfig.model
     │  ├── buildAiSdkTools({ toolNames, workspacePath, sessionId, ... })
     │  │    → returns Record<string, Tool> for AI SDK
     │  ├── Builds system message (preconfig + instructions + workspace context)
     │  ├── getModelWithMetadata(resolvedModelId, providerId, systemMessage) ◄── KEY POINT
     │  │    → returns { model, useProviderInstructions, omitMaxOutputTokens, providerOptions }
     │  ├── convertToAiSdkMessages(messages, modelDef?.capabilities)
     │  └── streamText({ model, messages, tools, maxOutputTokens, ... }) ◄── LLM CALL
     │
     ▼
8. For-await loop over result.fullStream:
     │  switch(delta.type):
     │    'text-delta'   → handlers.handleTextDelta()
     │    'reasoning'    → handlers.handleReasoningDelta()
     │    'tool-call'    → handlers.handleToolCall()
     │    'tool-result'  → handlers.handleToolResult()
     │  All events pushed to eventQueue, then yielded to caller
     │
     ▼
9. Back in message-router.ts:249 — event switch:
     │  'message.created' → ctx.broadcast(event)
     │  'message.updated' → updateMessage() + ctx.broadcast(event)
     │  'part.created'    → ctx.broadcast(event)
     │  'part.updated'    → ctx.broadcast(event)
     │  'usage'           → ctx.broadcast(chat.usage) + updateSession tokens
     │  'error.*'         → track error, broadcast error event
     │
     ▼
10. Client receives WebSocket messages → renders UI
```

### Key Interception Points

The sandbox needs to intercept at exactly **one** point:

| Point | File | Line | What Happens | Sandbox Behavior |
|-------|------|------|-------------|-----------------|
| `getModelWithMetadata()` | `model-utils.ts` | 24-143 | Resolves `LanguageModel` from provider | Returns sandbox's mock model |
| `streamText()` call | `agent.ts` | 192-204 | Calls LLM via AI SDK | Uses sandbox model — blocks on response |

Everything before and after these points runs normally.

## The Provider Registry — Our Extension Point

The existing provider system in `src/providers/registry.ts`:

```typescript
export interface ConnectableProvider {
  descriptor: ProviderDescriptor;
  getStatus(): ProviderStatus;
  connect(): Promise<{ authorizationUrl?: string }>;
  disconnect(): Promise<void>;
  createModel(options: ModelFactoryOptions): Promise<ModelFactoryResult>;
  onConnectComplete?: (callback: (success: boolean, error?: string) => void) => void;
}
```

Registered via:
```typescript
registerProvider(provider: ConnectableProvider): void
```

Resolved in `model-utils.ts:50-63`:
```typescript
const registeredProvider = provider ? getProvider(provider) : undefined;
if (registeredProvider) {
  const result = await createModelForProvider({
    modelId: model,
    providerId: provider,
    systemPrompt: systemPrompt || '',
  });
  return {
    model: result.model,
    useProviderInstructions: result.useProviderInstructions,
    omitMaxOutputTokens: result.omitMaxOutputTokens,
    providerOptions: result.providerOptions,
  };
}
```

**This is the insertion point.** A `SandboxProvider` implementing `ConnectableProvider` gets registered. When `getModelWithMetadata()` is called, it finds the registered sandbox provider and calls `createModel()`, which returns the interactive mock `LanguageModel`.

The rest of the server never knows the difference.

## Secondary LLM Call Sites

The primary chat loop is the main interception point, but there are other places that call LLMs:

### Compaction (`compaction.ts:449`)
```typescript
const result = await aiGenerateText({ model, prompt });
```
Uses `getModelWithMetadata()` internally → **automatically uses sandbox model**.

### Tool LLM API (`tools/llm-api.ts:34`, `tools/llm-api.ts:70`)
```typescript
// createLlmApi() → generateText({ model })
// createLlmApi() → generateObject({ model })
```
Uses `getModelWithMetadata()` internally → **automatically uses sandbox model**.

### Subagent (`child-session.ts:113`)
```typescript
for await (const event of streamChatWithRetry({
  sessionId: childSessionId,
  preconfig,
  messages,
  // ...
})) { ... }
```
Goes through the same `streamChat` → `getModelWithMetadata` path → **automatically uses sandbox model**.

### Key Insight
All LLM calls funnel through `getModelWithMetadata()`. Intercepting there catches everything — primary chat, compaction, tool LLM, subagents. One interception point, total coverage.

## What the Sandbox Must Handle

The sandbox's mock `LanguageModel` must support two AI SDK methods:

### `doStream()` — Used by `streamText()` (primary chat, subagents)
Called in `agent.ts:192` and `child-session.ts` (via `streamChatWithRetry`).

Must yield streaming deltas:
- `{ type: 'text-delta', id, delta }` — text response
- `{ type: 'text-start', id }` / `{ type: 'text-end', id }` — text boundaries
- `{ type: 'tool-call', toolCallId, toolName, input }` — tool invocation
- `{ type: 'tool-result', toolCallId, toolName, result }` — tool result
- `{ type: 'reasoning-delta', id, delta }` — reasoning (optional)
- `{ type: 'finish', finishReason, usage }` — stream completion

### `doGenerate()` — Used by `generateText()` (compaction, tool LLM API)
Called in `compaction.ts` and `tools/llm-api.ts`.

Must return a result:
- `{ content: [{ type: 'text', text }], finishReason, usage, warnings }`

## The Tool Execution Pipeline (Runs for Real)

When the sandbox model emits a tool call, here's what happens — all real code:

```
1. AI SDK receives tool-call delta from stream
     │
     ▼
2. agent.ts:262-275 — delta.type === 'tool-call'
     │  handlers.handleToolCall(delta) → creates ToolPart in DB, broadcasts part.created
     │
     ▼
3. AI SDK's tool execution loop:
     │  Looks up tool name in tools Record
     │  Calls tool.execute(args, { toolCallId })
     │
     ▼
4. build-tools.ts:97 — execute callback
     │  interruptManager.registerToolExecution(sessionId, toolCallId)
     │  createLlmApi() → creates tool's LLM access
     │  createAskApi() → creates tool's user-ask access
     │  executeTool({ tool, args, workspacePath, sessionId, ... })
     │
     ▼
5. executor.ts:206 — executeTool(options)
     │  Creates ToolContext (fs, env, llm, ask, logger, fetch, path helpers)
     │  tool.execute(args, ctx)
     │  Timeout wrapper (default 30s)
     │
     ▼
6. Tool runs for real (e.g., read-file, shell, edit)
     │  May trigger permission check via ctx.ask
     │  May use ctx.llm for sub-operations
     │
     ▼
7. Result flows back:
     │  executor returns ToolResult { success, result?, error? }
     │  build-tools truncates result if needed
     │  AI SDK produces tool-result delta
     │  agent.ts:271-274 — handlers.handleToolResult(delta)
     │  Tool state transition: pending → running → completed/error
     │
     ▼
8. AI SDK may make another LLM call (multi-step) → back to sandbox model
```

**Everything from step 3 onward is real.** The sandbox only controls step 1 (what tool call is emitted) and the subsequent LLM call (what the "LLM" says after seeing the tool result).

## Permission Flow (What We're Testing)

The permission system involves multiple components working together:

```
1. Tool calls ctx.ask({ question, options })
     │
     ▼
2. ask-user-api.ts — creates pending ask in DB, broadcasts ask.request
     │  Routes through askBroadcastFn → ctx.broadcast
     │
     ▼
3. Client receives ask.request → shows permission dialog
     │
     ▼
4. User grants/denies:
     │  message-router.ts handles "permission.grant" message
     │  or message-router.ts handles "ask.response" message
     │
     ▼
5. ask-user-api.ts — resolves pending ask
     │  If granted: returns value to tool, tool continues
     │  If denied: throws error, tool returns { success: false, error }
     │
     ▼
6. Tool result flows back to LLM → sandbox model receives it
```

The sandbox lets you trigger any point in this flow. You can:
- Make the "LLM" call a restricted tool → test permission request
- Make the "LLM" call `ctx.ask` → test ask/response flow
- Deny permission → test how the "LLM" handles denial
- Timeout the ask → test ask.timeout behavior

## Subagent Flow (What We're Testing)

```
1. Sandbox model emits tool-call for "task" tool
     │
     ▼
2. build-tools.ts:57 — task tool execute callback
     │  interruptManager.registerToolExecution(sessionId, toolCallId)
     │  executeSubagent({ description, prompt, sessionId, workspacePath, ... })
     │
     ▼
3. subagent.ts — executeSubagent(input)
     │  canSpawnSubagent(sessionId) — depth check (MAX_SUBAGENT_DEPTH = 2)
     │  Creates child session in DB
     │  Broadcasts session.created
     │  executeChildSession({ parentSessionId, childSessionId, preconfig, prompt, ... })
     │
     ▼
4. child-session.ts — executeChildSession(options)
     │  Creates user message in child session
     │  streamChatWithRetry({ sessionId: childSessionId, preconfig, messages, ... })
     │
     ▼
5. Goes through same agent.ts → getModelWithMetadata → sandbox model
     │  Sandbox model receives ANOTHER call (depth=1)
     │  You control what the subagent says independently
     │
     ▼
6. Subagent completes → result flows back to parent
     │  Task tool returns { task_id, result, error? }
     │  Parent "LLM" sees the subagent result → back to sandbox model
```

The sandbox controller must track **depth** so you can control subagent responses independently from parent responses.

## Store and Broadcast Integration

These systems run completely unchanged in sandbox mode:

### Store (`src/store/`)
- In-memory or file-backed SQLite
- All CRUD operations (sessions, messages, parts, permissions, pending asks, queues)
- Schema initialization, migrations
- **No changes needed for sandbox**

### Broadcast (`src/core/broadcast.ts`)
- `registerBroadcastCallback()` — called by `index.ts` during server startup
- `broadcastEvent()`, `broadcastSessionCreated()`, `broadcastSessionUpdated()`
- Routes through `RouterContext.broadcast` → WebSocket send
- **No changes needed for sandbox**

### Interrupt Manager (`src/core/interrupt.ts`)
- `InterruptManager` — manages AbortControllers per session and tool
- Cascading abort to child sessions
- Tool-level abort tracking
- **No changes needed for sandbox**

## What Needs to Change (Summary)

| Component | Change Required | Scope |
|-----------|----------------|-------|
| `providers/registry.ts` | None — just register sandbox provider | 0 lines |
| `core/model-utils.ts` | None — already checks registered providers first | 0 lines |
| `core/agent.ts` | None — calls `getModelWithMetadata()` | 0 lines |
| `core/retry.ts` | None — delegates to `streamChat` | 0 lines |
| `core/message-router.ts` | None — delegates to `streamChatWithRetry` | 0 lines |
| `core/build-tools.ts` | None — tool execution is real | 0 lines |
| `tools/executor.ts` | None — tool execution is real | 0 lines |
| `core/compaction.ts` | None — uses `getModelWithMetadata()` internally | 0 lines |
| `tools/llm-api.ts` | None — uses `getModelWithMetadata()` internally | 0 lines |
| `store/*` | None — completely unchanged | 0 lines |
| `core/broadcast.ts` | None — completely unchanged | 0 lines |
| `core/interrupt.ts` | None — completely unchanged | 0 lines |
| `index.ts` | Add sandbox activation + control routes | ~30 lines |
| **NEW: `sandbox/provider.ts`** | `ConnectableProvider` implementation | ~60 lines |
| **NEW: `sandbox/controller.ts`** | Call queue, response dispatch, depth tracking | ~200 lines |
| **NEW: `sandbox/model.ts`** | `LanguageModelV3` implementation | ~150 lines |
| **NEW: `sandbox/routes.ts`** | Control API REST/WS routes | ~100 lines |
| **NEW: `sandbox/types.ts`** | Shared types for sandbox protocol | ~80 lines |
| **NEW: `packages/sandbox-cli/`** | Standalone CLI package for interactive control | ~400 lines |

**Total new code: ~1020 lines. Total changes to existing code: ~30 lines. Zero changes to client or SDK.**

The architecture already supports this. The provider registry is the exact abstraction layer we need. The fact that all LLM calls funnel through `getModelWithMetadata()` means one registration point catches everything.
