# 05 — DI Refactoring

The dependency injection changes needed to make the sandbox clean. These changes are required regardless — the sandbox is just the forcing function.

## Current State

Previous refactoring rounds (documented in `06-refactoring-guide.md`) have already established:

- ✅ `RouterContext` with injectable `send`/`broadcast` (message-router extraction)
- ✅ `StreamChatFn` injectable into `streamChatWithRetry` (retry refactoring)
- ✅ `GenerateSummaryFn` injectable into `processCompactionTask` (compaction refactoring)
- ✅ `BroadcastFn` / `BroadcastSessionFn` as optional parameters everywhere
- ✅ `DatabaseSingleton` with `DB.configure()`/`DB.reset()` for test DB isolation
- ✅ `PathsSingleton` with `setupTestDataDir()`/`resetTestDataDir()` for path isolation

What's **not yet** injectable:

| Module | Coupling | Impact |
|--------|----------|--------|
| `model-utils.ts` | Directly instantiates AI SDK providers | Can't swap to sandbox model cleanly |
| `getModelWithMetadata()` | Standalone function, no context | Can't pass session ID to model |
| `tools/llm-api.ts` | Imports `getModelWithMetadata` directly | Tool LLM calls use real provider |
| `agent.ts` | Imports `getModelWithMetadata` directly | Agent uses whatever model is resolved |

## Refactoring #10: Thread Session ID Through Model Resolution

### Problem
`SandboxLanguageModel` needs the session ID to compute depth. Currently `getModelWithMetadata()` has no way to receive it.

### Current Code

```typescript
// model-utils.ts
export async function getModelWithMetadata(
  modelId?: string,
  providerId?: string,
  systemPrompt?: string,
): Promise<ModelWithMetadata> { ... }

// agent.ts
const { model, ... } = await getModelWithMetadata(resolvedModelId, providerId, systemMessage);
```

### Target Code

```typescript
// model-utils.ts
export interface ModelResolutionOptions {
  modelId?: string;
  providerId?: string;
  systemPrompt?: string;
  sessionId?: string;
}

export async function getModelWithMetadata(
  options: ModelResolutionOptions,
): Promise<ModelWithMetadata> { ... }

// agent.ts
const { model, ... } = await getModelWithMetadata({
  modelId: resolvedModelId,
  providerId,
  systemPrompt: systemMessage,
  sessionId: _sessionId,
});
```

### Changes Required

1. **`model-utils.ts`** — Convert 3 positional params to single options object
2. **`agent.ts`** — Update call site to use options object with `sessionId`
3. **`compaction.ts`** — Update call site (already has `sessionId` available via `processCompactionTask` param)
4. **`tools/llm-api.ts`** — Update call site (receives sessionId via tool context)

### Backward Compatibility

Add a compatibility wrapper:
```typescript
// During migration, support both signatures
export async function getModelWithMetadata(
  modelIdOrOptions: string | ModelResolutionOptions,
  providerId?: string,
  systemPrompt?: string,
): Promise<ModelWithMetadata> {
  const options = typeof modelIdOrOptions === 'string'
    ? { modelId: modelIdOrOptions, providerId, systemPrompt }
    : modelIdOrOptions;
  // ... rest of function
}
```

Remove the compatibility wrapper once all call sites are migrated.

### Risk: Low
Mechanical parameter change. The function body is identical, just accessing `options.modelId` instead of `modelId`.

## Refactoring #11: Extend `ModelFactoryOptions` with Session Context

### Problem
`ConnectableProvider.createModel()` receives `ModelFactoryOptions` which doesn't include session context. The `SandboxProvider` needs it to create a per-session model.

### Current Code

```typescript
// providers/registry.ts
export interface ModelFactoryOptions {
  modelId: string;
  providerId: string;
  systemPrompt: string;
}
```

### Target Code

```typescript
// providers/registry.ts
export interface ModelFactoryOptions {
  modelId: string;
  providerId: string;
  systemPrompt: string;
  /** Session ID requesting this model (for sandbox depth tracking) */
  sessionId?: string;
}
```

### Changes Required

1. **`providers/registry.ts`** — Add optional `sessionId` to `ModelFactoryOptions`
2. **`model-utils.ts`** — Pass `sessionId` through to `createModelForProvider()`

```typescript
// model-utils.ts (inside getModelWithMetadata)
const result = await createModelForProvider({
  modelId: model,
  providerId: provider,
  systemPrompt: systemPrompt || '',
  sessionId: options.sessionId,
});
```

### Risk: Very Low
Adding an optional field. No existing providers use it. No behavior change.

## Refactoring #12: Make Model Resolution Registry-First

### Problem
`getModelWithMetadata()` currently does:
1. Try to resolve provider from `providers/registry.ts` → if found, use it
2. Otherwise, fall through to hardcoded switch statement

This works for sandbox (we register the sandbox provider). But the function has a bug: if `providerId` is not set, it tries to infer it from the model name, and only then checks the registry. The sandbox provider is registered as `'sandbox'`, so we need to ensure the provider ID resolves correctly.

### Current Flow (simplified)
```typescript
// model-utils.ts
let provider = providerId;
if (!provider) {
  // Infer from model name
  if (modelId.startsWith('claude-')) provider = 'anthropic';
  else provider = 'openai';
}

const registered = getProvider(provider);
if (registered) {
  return createModelForProvider(registered, ...);
}

// Fall through to hardcoded SDK factories
switch (provider) { ... }
```

### Target Flow
```typescript
// model-utils.ts
let provider = providerId;

// Sandbox override: if JEAN2_SANDBOX is active, always route to sandbox
if (isSandboxActive()) {
  provider = 'sandbox';
}

if (!provider) {
  // Infer from model name
  if (modelId?.startsWith('claude-')) provider = 'anthropic';
  else provider = 'openai';
}

const registered = getProvider(provider);
if (registered) {
  return createModelForProvider(registered, ...);
}

// Fall through to hardcoded SDK factories
switch (provider) { ... }
```

### Changes Required

1. **`model-utils.ts`** — Import `isSandboxActive()` from sandbox module, check before provider inference
2. Or, simpler: **the sandbox provider registers as `'sandbox'` and the default provider in sandbox mode is set to `'sandbox'`** via `config/defaultProvider`

The second approach is cleaner — no sandbox-specific code in `model-utils.ts`. The sandbox mode just sets the default provider:

```typescript
// sandbox/index.ts
export function activateSandbox(): void {
  registerProvider(new SandboxProvider());
  // Override default provider so all sessions use sandbox
  setDefaultProvider('sandbox');
}
```

But this requires a `setDefaultProvider()` mechanism. Currently the default comes from `models.json`. We need:

### Option A: Environment Variable Override
```bash
JEAN2_SANDBOX=true JEAN2_LLM_DEFAULT_PROVIDER=sandbox bun run dev
```

The existing `getModelsConfig()` reads from `models.json` which has `defaultProvider`. We could add an env var override.

### Option B: Registry Check Before Inference
In `getModelWithMetadata()`, check if there's a registered provider matching the inferred provider ID. If not, check for `'sandbox'` provider. This is what the current code already does — if we register the sandbox provider with a known ID and ensure the provider resolves to it, it works.

### Recommended Approach

The simplest path: **register the sandbox provider as `'sandbox'` and ensure the session's `selectedProvider` is set to `'sandbox'` when in sandbox mode.**

In `message-router.ts`, when sandbox is active:
```typescript
// message-router.ts (in runSingleChatTurn or handleChat)
const effectiveProvider = isSandboxActive() ? 'sandbox' : provider;
```

This is a single conditional in one place. No changes to model resolution logic.

### Risk: Low
The provider registry already supports this pattern. The only change is ensuring the provider ID resolves to `'sandbox'` when sandbox mode is active.

## Refactoring #13: Inject Model Resolution into Agent

### Problem (Future)
`agent.ts` directly imports `getModelWithMetadata`. For full DI, the agent should receive the model (or model factory) as a parameter.

### Why This Matters
This is the refactoring that enables **unit testing `agent.ts` directly** — not just sandbox testing. If the agent receives its model as a parameter, tests can inject any mock without needing the provider registry.

### Current Code

```typescript
// agent.ts
import { getModelWithMetadata } from './model-utils';

export async function* streamChat(options: ChatOptions) {
  // ...
  const { model } = await getModelWithMetadata(resolvedModelId, providerId, systemMessage);
  const result = streamText({ model, messages, tools, ... });
  // ...
}
```

### Target Code

```typescript
// agent.ts
import { getModelWithMetadata, type ModelResolutionOptions } from './model-utils';

export type ModelFactory = (options: ModelResolutionOptions) => Promise<ModelWithMetadata>;

export async function* streamChat(
  options: ChatOptions,
  modelFactory: ModelFactory = getModelWithMetadata,
) {
  // ...
  const { model } = await modelFactory({
    modelId: resolvedModelId,
    providerId,
    systemPrompt: systemMessage,
    sessionId: _sessionId,
  });
  const result = streamText({ model, messages, tools, ... });
  // ...
}
```

### Changes Required

1. **`agent.ts`** — Add optional `modelFactory` parameter with default
2. **`retry.ts`** — `StreamChatFn` type already matches — the factory is internal to `streamChat`
3. **`child-session.ts`** — Calls `streamChatWithRetry` which calls `streamChat` — no change needed
4. **Tests** — Can inject a custom `modelFactory` that returns any model

### Risk: Low
Optional parameter with safe default. All existing callers unchanged.

### When to Do This
**Not immediately.** This refactoring is valuable for unit testing the agent but not required for the sandbox. The sandbox uses the provider registry approach instead. Do this when you want to unit-test `agent.ts` in isolation.

## Refactoring #14: Inject LLM API into Tools

### Problem (Future)
`tools/llm-api.ts` creates an `LlmApi` by calling `getModelWithMetadata()` directly. In sandbox mode this works (provider registry handles it), but for unit testing tools in isolation, the LLM API should be injectable.

### Current State

Already partially done! `buildAiSdkTools` in `build-tools.ts` creates the factory:

```typescript
// build-tools.ts:101
const llmFactory = () => createLlmApi(modelId, providerId);
```

And `createLlmApi` is passed as `createLlmApi` to `executeTool`:

```typescript
// build-tools.ts:117
createLlmApi: llmFactory,
```

The tool executor uses it:
```typescript
// executor.ts:228
llm: createLlmApi ? createLlmApi() : ({} as LlmApi),
```

So the LLM API is **already injectable** at the tool level. For sandbox mode, `createLlmApi()` will naturally use the sandbox provider via `getModelWithMetadata()`.

### What Could Be Improved

The factory `() => createLlmApi(modelId, providerId)` is hardcoded in `build-tools.ts`. For testing, we could make the factory itself injectable:

```typescript
export async function buildAiSdkTools(
  options: BuildToolsOptions,
  broadcast: BroadcastFn = broadcastEvent,
  llmApiFactory?: () => LlmApi,  // NEW: injectable
): Promise<Record<string, Tool>> {
  // ...
  const llmFactory = llmApiFactory ?? (() => createLlmApi(modelId, providerId));
  // ...
}
```

But this is **not needed for sandbox** — the default factory works because it goes through the provider registry. Only needed for isolated tool unit tests.

## Summary: What's Required vs. Optional

### Required for Sandbox (Must Do)

| # | Refactoring | Effort | Files Changed |
|---|-------------|--------|---------------|
| 10 | Thread sessionId through model resolution | **Small** | `model-utils.ts`, `agent.ts`, `compaction.ts`, `llm-api.ts` |
| 11 | Extend `ModelFactoryOptions` with sessionId | **Tiny** | `providers/registry.ts`, `model-utils.ts` |
| 12 | Provider ID routing in sandbox mode | **Tiny** | `message-router.ts` or `env.ts` |

### Recommended but Not Required

| # | Refactoring | Effort | Benefit |
|---|-------------|--------|---------|
| 13 | Inject model factory into agent | **Small** | Unit test `agent.ts` directly |
| 14 | Inject LLM API factory into buildTools | **Tiny** | Unit test tools in isolation |

### Future (When Needed)

| # | Refactoring | Effort | Benefit |
|---|-------------|--------|---------|
| — | Make `broadcast.ts` fully injectable (no global callback) | **Medium** | Remove `registerBroadcastCallback` pattern |
| — | Make `store/index.ts` injectable (no singleton) | **Medium** | Already done via `DatabaseSingleton` |
| — | Make `interruptManager` injectable | **Small** | Per-test interrupt isolation |

## Refactoring Order for Sandbox

```
Step 1: #11 — Add sessionId to ModelFactoryOptions       ← 5 minutes
Step 2: #10 — Convert getModelWithMetadata to options obj ← 30 minutes
Step 3: #12 — Route provider to 'sandbox' in sandbox mode ← 15 minutes
```

Total: ~50 minutes of refactoring before the sandbox can plug in.
