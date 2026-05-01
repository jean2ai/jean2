# 02 — Sandbox Provider

The core engine: the interactive `LanguageModelV3`, the `SandboxController`, the response types, and the `SandboxProvider` that wires it all into the provider registry.

## File Structure

```
src/sandbox/
  types.ts          — SandboxResponse, LlmCallContext, control protocol types
  controller.ts     — SandboxController: call queue, response dispatch, depth tracking
  model.ts          — SandboxLanguageModel: LanguageModelV3 that blocks on controller
  provider.ts       — SandboxProvider: ConnectableProvider impl
  routes.ts         — REST + WS routes for sandbox control API
  index.ts          — Public API: activate(), deactivate(), isActive()
```

## Types (`types.ts`)

### LlmCallContext

Every time the server calls the LLM, the sandbox captures the full context:

```typescript
export interface LlmCallContext {
  /** Unique ID for this specific LLM invocation */
  callId: string;

  /** Which session triggered this call */
  sessionId: string;

  /** Depth in the call hierarchy (0=primary, 1=subagent, 2=sub-subagent) */
  depth: number;

  /** The call mode */
  mode: 'stream' | 'generate';

  /** What the LLM received as conversation history */
  messages: Array<{
    role: string;
    content: unknown;
  }>;

  /** The system prompt (if provided) */
  systemPrompt?: string;

  /** Available tools and their schemas */
  tools: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;

  /** Model ID that was requested */
  modelId: string;

  /** Provider ID that was requested */
  providerId: string;

  /** Timestamp when the call started */
  timestamp: number;

  /** Parent call ID (if this is a subagent call) */
  parentCallId?: string;
}
```

### SandboxResponse

The different responses you can give to control what the "LLM" does:

```typescript
export type SandboxResponse =
  | TextResponse
  | ToolCallResponse
  | MultiToolCallResponse
  | ErrorResponse
  | ReasoningResponse;

/** Plain text response — the LLM just talks */
export interface TextResponse {
  type: 'text';
  content: string;
}

/** Single tool call — the LLM invokes one tool */
export interface ToolCallResponse {
  type: 'tool-call';
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string; // auto-generated if not provided
}

/** Multiple tool calls in one step */
export interface MultiToolCallResponse {
  type: 'multi-tool-call';
  calls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    toolCallId?: string;
  }>;
}

/** Error response — simulates LLM API failure */
export interface ErrorResponse {
  type: 'error';
  error: string;
  errorType?: 'rate_limit' | 'server' | 'timeout' | 'auth' | 'invalid_request';
}

/** Response with reasoning/thinking */
export interface ReasoningResponse {
  type: 'reasoning';
  reasoning: string;
  text: string;
}
```

### Why This Type Design

**No `subagent` response type.** Subagents are not a response type — they're a tool call. The "task" tool IS the subagent trigger. When you send a `ToolCallResponse` with `toolName: 'task'`, the real tool execution pipeline handles spawning the child session. The sandbox controller then receives a new `LlmCallContext` with `depth: 1` for the subagent's LLM call. You respond to that independently.

This keeps the response type space small and composable. The server handles all the complexity.

**No `ask-user` response type.** Same reason. The `ask` API is invoked by tools, not by the LLM directly. If you want to test ask/response, make the "LLM" call a tool that triggers `ctx.ask()`. The tool execution handles the rest.

### Control Protocol Messages

For the WebSocket control channel:

```typescript
/** Server → Client: LLM call is waiting for input */
export interface SandboxCallWaitingEvent {
  type: 'sandbox.call_waiting';
  context: LlmCallContext;
}

/** Client → Server: Respond to a pending call */
export interface SandboxRespondMessage {
  type: 'sandbox.respond';
  callId: string;
  response: SandboxResponse;
}

/** Server → Client: Call completed (response was consumed) */
export interface SandboxCallCompletedEvent {
  type: 'sandbox.call_completed';
  callId: string;
}

/** Server → Client: History of all calls/responses */
export interface SandboxHistoryEvent {
  type: 'sandbox.history';
  entries: SandboxHistoryEntry[];
}

export interface SandboxHistoryEntry {
  callId: string;
  context: LlmCallContext;
  response: SandboxResponse | null; // null if still pending
  respondedAt: number | null;
  completedAt: number | null;
}
```

## SandboxController (`controller.ts`)

The coordination layer. Manages pending calls, dispatches responses, tracks depth.

```typescript
export class SandboxController {
  private pendingCalls = new Map<string, {
    context: LlmCallContext;
    resolve: (response: SandboxResponse) => void;
  }>();

  private history: SandboxHistoryEntry[] = [];
  private broadcastEvent: ((event: unknown) => void) | null = null;

  /** Called by SandboxLanguageModel when doStream/doGenerate is invoked */
  async waitForResponse(context: LlmCallContext): Promise<SandboxResponse> {
    return new Promise<SandboxResponse>((resolve) => {
      this.pendingCalls.set(context.callId, { context, resolve });

      this.history.push({
        callId: context.callId,
        context,
        response: null,
        respondedAt: null,
        completedAt: null,
      });

      // Notify control panel / test script
      this.broadcast({
        type: 'sandbox.call_waiting',
        context,
      });
    });
  }

  /** Called by control API when user/script provides a response */
  respond(callId: string, response: SandboxResponse): void {
    const pending = this.pendingCalls.get(callId);
    if (!pending) {
      throw new Error(`No pending call with id: ${callId}`);
    }

    this.pendingCalls.delete(callId);

    // Update history
    const entry = this.history.find(e => e.callId === callId);
    if (entry) {
      entry.response = response;
      entry.respondedAt = Date.now();
    }

    // Resolve the promise — unblocks the LanguageModel
    pending.resolve(response);
  }

  /** Called when the LanguageModel finishes consuming the response */
  complete(callId: string): void {
    const entry = this.history.find(e => e.callId === callId);
    if (entry) {
      entry.completedAt = Date.now();
    }

    this.broadcast({
      type: 'sandbox.call_completed',
      callId,
    });
  }

  /** Get all pending calls (for REST API) */
  getPendingCalls(): LlmCallContext[] {
    return Array.from(this.pendingCalls.values()).map(p => p.context);
  }

  /** Get pending call by ID */
  getPendingCall(callId: string): LlmCallContext | undefined {
    return this.pendingCalls.get(callId)?.context;
  }

  /** Get full history */
  getHistory(): SandboxHistoryEntry[] {
    return this.history;
  }

  /** Clear history */
  clearHistory(): void {
    this.history = [];
  }

  /** Set the broadcast function for control events */
  setBroadcast(fn: (event: unknown) => void): void {
    this.broadcastEvent = fn;
  }

  private broadcast(event: unknown): void {
    if (this.broadcastEvent) {
      this.broadcastEvent(event);
    }
  }
}

/** Singleton controller instance — created on activation, destroyed on deactivation */
export const sandboxController = new SandboxController();
```

### Depth Tracking

The controller doesn't track depth itself — the `LlmCallContext.depth` is computed by the `SandboxLanguageModel` when it receives the call. The model checks the current session hierarchy to determine depth:

```typescript
function computeCallDepth(sessionId: string): number {
  // Walk up the parent chain — same logic as subagent.ts:computeSessionDepth
  let depth = 0;
  let session = getSession(sessionId);
  while (session?.parentId) {
    depth++;
    session = getSession(session.parentId);
  }
  return depth;
}
```

## SandboxLanguageModel (`model.ts`)

The AI SDK `LanguageModelV3` implementation that blocks on the controller.

```typescript
import type { LanguageModelV3, LanguageModelV3CallOptions } from 'ai';
import { simulateReadableStream } from 'ai';
import { randomUUID } from 'crypto';
import { sandboxController } from './controller';
import type { SandboxResponse, LlmCallContext } from './types';

export class SandboxLanguageModel implements LanguageModelV3 {
  readonly modelId = 'sandbox-model';
  readonly provider = 'sandbox';

  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async doStream(options: LanguageModelV3CallOptions) {
    const context: LlmCallContext = {
      callId: randomUUID(),
      sessionId: this.sessionId,
      depth: this.computeDepth(),
      mode: 'stream',
      messages: options.prompt.map(p => ({
        role: p.role,
        content: p.content,
      })),
      systemPrompt: options.prompt.find(p => p.role === 'system')?.content as string | undefined,
      tools: Object.entries(options.tools ?? {}).map(([name, def]) => ({
        name,
        description: (def as any).description ?? '',
        inputSchema: (def as any).inputSchema,
      })),
      modelId: 'sandbox',
      providerId: 'sandbox',
      timestamp: Date.now(),
    };

    // BLOCK here until user/script provides a response
    const response = await sandboxController.waitForResponse(context);

    try {
      const stream = this.responseToStream(response);
      return { stream };
    } finally {
      sandboxController.complete(context.callId);
    }
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const context: LlmCallContext = {
      callId: randomUUID(),
      sessionId: this.sessionId,
      depth: this.computeDepth(),
      mode: 'generate',
      messages: options.prompt.map(p => ({
        role: p.role,
        content: p.content,
      })),
      systemPrompt: options.prompt.find(p => p.role === 'system')?.content as string | undefined,
      tools: [],
      modelId: 'sandbox',
      providerId: 'sandbox',
      timestamp: Date.now(),
    };

    const response = await sandboxController.waitForResponse(context);

    try {
      return this.responseToGenerateResult(response);
    } finally {
      sandboxController.complete(context.callId);
    }
  }

  private responseToStream(response: SandboxResponse) {
    const chunks: unknown[] = [];

    switch (response.type) {
      case 'text': {
        const textId = randomUUID();
        chunks.push(
          { type: 'text-start', id: textId },
          { type: 'text-delta', id: textId, delta: response.content },
          { type: 'text-end', id: textId },
        );
        break;
      }

      case 'reasoning': {
        const reasoningId = randomUUID();
        const textId = randomUUID();
        chunks.push(
          { type: 'reasoning', id: reasoningId, delta: response.reasoning },
          { type: 'reasoning-end', id: reasoningId },
          { type: 'text-start', id: textId },
          { type: 'text-delta', id: textId, delta: response.text },
          { type: 'text-end', id: textId },
        );
        break;
      }

      case 'tool-call': {
        chunks.push({
          type: 'tool-call',
          toolCallId: response.toolCallId ?? randomUUID(),
          toolName: response.toolName,
          input: JSON.stringify(response.args),
        });
        break;
      }

      case 'multi-tool-call': {
        for (const call of response.calls) {
          chunks.push({
            type: 'tool-call',
            toolCallId: call.toolCallId ?? randomUUID(),
            toolName: call.toolName,
            input: JSON.stringify(call.args),
          });
        }
        break;
      }

      case 'error': {
        // Throw an error that will be caught by the retry logic
        throw new Error(response.error);
      }
    }

    // Always add finish
    chunks.push({
      type: 'finish',
      finishReason: { unified: 'stop' as const, raw: undefined },
      logprobs: undefined,
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
    });

    return simulateReadableStream({ chunks });
  }

  private responseToGenerateResult(response: SandboxResponse) {
    if (response.type === 'error') {
      throw new Error(response.error);
    }

    const text = response.type === 'text' ? response.content
      : response.type === 'reasoning' ? response.text
      : JSON.stringify(response);

    return {
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    };
  }

  private computeDepth(): number {
    let depth = 0;
    let session = getSession(this.sessionId);
    while (session?.parentId) {
      depth++;
      session = getSession(session.parentId);
    }
    return depth;
  }
}
```

### Why Per-Session Models

The `SandboxLanguageModel` takes a `sessionId` in its constructor. This is necessary because:

1. **Depth computation** requires knowing which session this call is for.
2. **Future: per-session control** — you might want to auto-respond for some sessions and manually control others.

The `SandboxProvider.createModel()` receives the session context through `ModelFactoryOptions` (which could be extended if needed). Currently, the provider can derive the sessionId from the call context. An alternative is to use a shared model that resolves the session from the AI SDK's call options.

### Simpler Alternative: Single Shared Model

If per-session tracking isn't needed initially, a simpler approach works:

```typescript
export class SandboxLanguageModel implements LanguageModelV3 {
  readonly modelId = 'sandbox-model';
  readonly provider = 'sandbox';

  async doStream(options: LanguageModelV3CallOptions) {
    // Derive sessionId from options.prompt or use a default
    const sessionId = this.extractSessionId(options) ?? 'unknown';
    // ... rest same as above
  }
}
```

This is simpler but loses per-session control. Start with this, upgrade to per-session if needed.

## SandboxProvider (`provider.ts`)

The `ConnectableProvider` implementation:

```typescript
import type { ConnectableProvider, ModelFactoryOptions, ModelFactoryResult } from '@/providers/registry';
import type { ProviderDescriptor, ProviderStatus } from '@jean2/sdk';
import { SandboxLanguageModel } from './model';

export class SandboxProvider implements ConnectableProvider {
  descriptor: ProviderDescriptor = {
    id: 'sandbox',
    name: 'Sandbox (Interactive Mock)',
    type: 'custom',
  };

  getStatus(): ProviderStatus {
    return { provider: 'sandbox', connected: true };
  }

  async connect(): Promise<{ authorizationUrl?: string }> {
    return {}; // Always connected
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  async createModel(options: ModelFactoryOptions): Promise<ModelFactoryResult> {
    return {
      model: new SandboxLanguageModel(options.sessionId ?? 'default'),
      useProviderInstructions: false,
      omitMaxOutputTokens: true,
    };
  }
}
```

**~40 lines.** The provider is a thin adapter. All the complexity is in the controller and model.

### Note on `ModelFactoryOptions`

Currently `ModelFactoryOptions` has:

```typescript
export interface ModelFactoryOptions {
  modelId: string;
  providerId: string;
  systemPrompt: string;
}
```

It does **not** include `sessionId`. We'll need to add it (or find another way to pass session context to the model). Options:

1. **Extend `ModelFactoryOptions`** — add optional `sessionId` field. Small change to `providers/registry.ts` and `model-utils.ts`.
2. **Thread it through `getModelWithMetadata`** — add `sessionId` param. Small change to `model-utils.ts` and `agent.ts`.
3. **Use ambient context** — set a module-level "current session" that the model reads. Simpler but less clean.

Option 1 is cleanest. See `05-di-refactoring.md` for details.

## Activation (`index.ts` changes)

The sandbox is activated at server startup:

```typescript
// In index.ts, before Bun.serve():
if (process.env.JEAN2_SANDBOX === 'true') {
  const { activateSandbox } = await import('@/sandbox');
  activateSandbox(broadcast); // Pass broadcast fn for control events
}
```

```typescript
// sandbox/index.ts
import { registerProvider } from '@/providers';
import { SandboxProvider } from './provider';
import { sandboxController } from './controller';

let active = false;

export function activateSandbox(
  broadcastFn?: (event: unknown) => void,
): void {
  if (active) return;
  active = true;

  registerProvider(new SandboxProvider());

  if (broadcastFn) {
    sandboxController.setBroadcast(broadcastFn);
  }

  console.log('[Sandbox] Activated — all LLM calls will be intercepted');
}

export function deactivateSandbox(): void {
  active = false;
  // Note: can't unregister from provider registry currently
  // This is fine — sandbox mode is for the lifetime of the server process
}

export function isSandboxActive(): boolean {
  return active;
}
```

## How `doStream` Produces AI SDK-Compatible Deltas

The existing `createMockStreamModel` in `tests/helpers/mocks.ts` already demonstrates the correct delta format. The sandbox model uses the same format:

```typescript
// Text delta format (from AI SDK V3 spec):
{ type: 'text-start', id: 'text-1' }
{ type: 'text-delta', id: 'text-1', delta: 'Hello' }
{ type: 'text-end', id: 'text-1' }

// Tool call format:
{ type: 'tool-call', toolCallId: 'call-1', toolName: 'read-file', input: '{"path":"/test.txt"}' }

// Finish format:
{
  type: 'finish',
  finishReason: { unified: 'stop', raw: undefined },
  logprobs: undefined,
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  },
}
```

The key insight: AI SDK's `streamText()` consumes these deltas through `simulateReadableStream()`. The delta types must match what `result.fullStream` yields. The existing `createMockToolCallModel` in `tests/helpers/mocks.ts` is a working reference implementation.

## Handling Multi-Step (Tool Calls + Follow-up)

When the sandbox emits a tool call via `doStream`, the AI SDK:

1. Emits the `tool-call` delta → our stream handlers process it
2. Calls the tool's `execute()` callback → real tool execution
3. Gets the tool result back
4. **Makes another call to `doStream()`** (next step in the multi-step loop)
5. The sandbox blocks again on `waitForResponse()`
6. Control panel shows the new call with tool result context
7. User responds again

This means for a 3-step interaction (tool call → result → text), the controller has 3 entries in history:

| Call # | Mode | What Happens |
|--------|------|-------------|
| 1 | stream | User tells sandbox to emit tool call |
| 2 | stream | Tool result is in context, user tells sandbox to emit text |
| (3) | stream | Only if the LLM needs another step |

Each call is independently controllable. The control panel shows the full context including tool results from previous steps.

## Edge Cases

### Compaction During Chat
Compaction calls `doGenerate()` on the sandbox model. The controller queues it like any other call. The control panel can auto-respond with a canned summary (configurable) or let the user control it.

**Default behavior**: Compaction calls get an automatic text response: `"Compaction summary of the conversation."` This is configurable.

### Tool LLM API During Chat
Tools that call `ctx.llm.generateText()` or `ctx.llm.generateStructured()` also go through the sandbox. These show up as `mode: 'generate'` calls in the controller.

**Default behavior**: Tool LLM calls get an automatic response (configurable per test). In interactive mode, they show up in the control panel.

### Concurrent Sessions
Multiple sessions can be active simultaneously. Each gets its own `SandboxLanguageModel` instance. The controller handles multiple pending calls — one per session. The control panel shows all pending calls and which session they belong to.

### Timeouts
The sandbox blocks indefinitely by default. For scripted tests, a timeout should be set:

```typescript
const response = await Promise.race([
  sandboxController.waitForResponse(context),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Sandbox timeout')), 30_000)
  ),
]);
```

This prevents tests from hanging forever if the test script doesn't respond.
