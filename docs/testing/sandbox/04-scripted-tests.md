# 04 — Scripted Tests

The programmatic API for writing automated tests against the sandbox. Everything the interactive CLI can do, scripts can do too — via the same control API.

## Overview

Scripted tests run the server in sandbox mode, connect to the control API, and programmatically drive the "LLM" through assertions. This enables:

- **CI integration** — full pipeline tests that run on every PR
- **Regression testing** — replay scenarios that previously broke
- **Permission matrix testing** — exhaustive combinations of tools × paths × grants
- **Edge case coverage** — depth limits, timeouts, cascading interrupts, concurrent sessions

## Test Architecture

```
┌─────────────────────────────────────┐
│  Test Script (bun:test)             │
│                                     │
│  const sandbox = createSandbox();   │
│  const sdk = createSdkClient();     │
│                                     │
│  sdk.sendMessage(...)               │
│  const call = await sandbox.next()  │
│  sandbox.respond(call.id, ...)      │
│                                     │
│  expect(db.messages).toEqual(...)   │
└────────────┬────────────────────────┘
             │ HTTP (control API + SDK)
             ▼
┌─────────────────────────────────────┐
│  Server (JEAN2_SANDBOX=true)        │
│                                     │
│  Sandbox Provider intercepts LLM   │
│  Everything else runs for real      │
└─────────────────────────────────────┘
```

## `createSandbox()` — Test Utility

The main entry point for scripted tests:

```typescript
// tests/helpers/sandbox-client.ts

export interface SandboxClient {
  /** Wait for the next LLM call (blocks until one arrives) */
  next(options?: WaitForOptions): Promise<PendingCall>;

  /** Respond to a specific call */
  respond(callId: string, response: SandboxResponse): Promise<void>;

  /** Respond to the most recent pending call */
  respondLatest(response: SandboxResponse): Promise<void>;

  /** Get all currently pending calls */
  pending(): Promise<LlmCallContext[]>;

  /** Get a specific call by ID */
  getCall(callId: string): Promise<LlmCallContext | null>;

  /** Get full interaction history */
  history(): Promise<SandboxHistoryEntry[]>;

  /** Clear history and state */
  reset(): Promise<void>;

  /** Set auto-responder rules */
  setAutoResponders(rules: AutoResponderRule[]): Promise<void>;

  /** Disconnect and clean up */
  close(): Promise<void>;
}

export interface PendingCall {
  callId: string;
  context: LlmCallContext;

  /** Convenience: respond to this call */
  respond(response: SandboxResponse): Promise<void>;

  /** Convenience: respond with text */
  text(content: string): Promise<void>;

  /** Convenience: respond with a tool call */
  toolCall(toolName: string, args: Record<string, unknown>): Promise<void>;

  /** Convenience: respond with an error */
  error(message: string, errorType?: string): Promise<void>;
}

export interface WaitForOptions {
  /** Only match calls matching these criteria */
  filter?: {
    sessionId?: string;
    depth?: number;
    mode?: 'stream' | 'generate';
  };

  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

export async function createSandbox(serverUrl?: string): Promise<SandboxClient>;
```

### Implementation

The `SandboxClient` connects to the server's control API via HTTP and subscribes to WebSocket events:

```typescript
export async function createSandbox(serverUrl = 'http://localhost:3000'): Promise<SandboxClient> {
  const pendingQueue: LlmCallContext[] = [];
  const pendingResolvers: Array<(call: LlmCallContext) => void> = [];

  // Connect to WebSocket for real-time events
  const ws = new WebSocket(`${serverUrl.replace('http', 'ws')}/ws`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'sandbox.call_waiting') {
      if (pendingResolvers.length > 0) {
        pendingResolvers.shift()!(msg.context);
      } else {
        pendingQueue.push(msg.context);
      }
    }
  };

  // Wait for WebSocket connection
  await new Promise((resolve) => { ws.onopen = resolve; });

  const baseUrl = `${serverUrl}/api/sandbox`;

  return {
    async next(options = {}): Promise<PendingCall> {
      // Check queue first
      if (pendingQueue.length > 0) {
        const context = pendingQueue.shift()!;
        if (matchesFilter(context, options.filter)) {
          return createPendingCall(context, baseUrl);
        }
        // Doesn't match filter — skip, keep looking
        pendingQueue.push(context);
      }

      // Wait for new event
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Sandbox: timed out waiting for LLM call (${options.timeout ?? 30000}ms)`)),
          options.timeout ?? 30000,
        );

        pendingResolvers.push((context) => {
          clearTimeout(timer);
          if (options.filter && !matchesFilter(context, options.filter)) {
            // Doesn't match — re-queue and keep waiting
            pendingQueue.push(context);
            pendingResolvers.push(/* re-register */);
            return;
          }
          resolve(createPendingCall(context, baseUrl));
        });
      });
    },

    async respond(callId: string, response: SandboxResponse): Promise<void> {
      const res = await fetch(`${baseUrl}/pending/${callId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error(`Sandbox respond failed: ${await res.text()}`);
    },

    async respondLatest(response: SandboxResponse): Promise<void> {
      const pending = await this.pending();
      if (pending.length === 0) throw new Error('No pending calls');
      await this.respond(pending[pending.length - 1].callId, response);
    },

    async pending(): Promise<LlmCallContext[]> {
      const res = await fetch(`${baseUrl}/pending`);
      return res.json();
    },

    async getCall(callId: string): Promise<LlmCallContext | null> {
      const res = await fetch(`${baseUrl}/pending/${callId}`);
      if (res.status === 404) return null;
      return res.json();
    },

    async history(): Promise<SandboxHistoryEntry[]> {
      const res = await fetch(`${baseUrl}/history`);
      return res.json();
    },

    async reset(): Promise<void> {
      await fetch(`${baseUrl}/history`, { method: 'DELETE' });
      pendingQueue.length = 0;
    },

    async setAutoResponders(rules: AutoResponderRule[]): Promise<void> {
      await fetch(`${baseUrl}/auto-responder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
    },

    async close(): Promise<void> {
      ws.close();
    },
  };
}

function createPendingCall(context: LlmCallContext, baseUrl: string): PendingCall {
  return {
    callId: context.callId,
    context,
    async respond(response: SandboxResponse): Promise<void> {
      const res = await fetch(`${baseUrl}/pending/${context.callId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error(`Respond failed: ${await res.text()}`);
    },
    async text(content: string): Promise<void> {
      return this.respond({ type: 'text', content });
    },
    async toolCall(toolName: string, args: Record<string, unknown>): Promise<void> {
      return this.respond({ type: 'tool-call', toolName, args });
    },
    async error(message: string, errorType?: string): Promise<void> {
      return this.respond({ type: 'error', error: message, errorType: errorType as any });
    },
  };
}
```

## Test Patterns

### Pattern 1: Simple Text Chat

```typescript
import { describe, test, expect } from 'bun:test';

describe('Sandbox: simple text chat', () => {
  test('user sends message, LLM responds with text', async () => {
    const sandbox = await createSandbox();
    const sdk = createSdkClient();

    const session = await sdk.createSession({ workspaceId: 'test-ws' });

    // Send user message
    sdk.sendMessage(session.id, 'Hello, can you help me?');

    // Wait for LLM call, respond with text
    const call = await sandbox.next();
    expect(call.context.messages.length).toBeGreaterThan(0);

    await call.text('Of course! How can I help you?');

    // Verify: message persisted in DB
    const messages = sdk.getMessages(session.id);
    expect(messages).toHaveLength(2); // user + assistant
    expect(messages[1].role).toBe('assistant');

    await sandbox.close();
  });
});
```

### Pattern 2: Tool Call + Permission Denial

```typescript
describe('Sandbox: permission denial', () => {
  test('tool call denied → LLM sees error in next call', async () => {
    const sandbox = await createSandbox();
    const sdk = createSdkClient();

    const session = await sdk.createSession({ workspaceId: 'test-ws' });

    // Send user message
    sdk.sendMessage(session.id, 'Read the file at /etc/passwd');

    // LLM call #1: make it call read-file
    const call1 = await sandbox.next();
    await call1.toolCall('read-file', { path: '/etc/passwd' });

    // Tool executes for REAL → permission check
    // Wait for permission request broadcast
    const permEvent = await sdk.waitForEvent('ask.request');
    expect(permEvent.toolName).toBe('read-file');

    // Deny permission
    await sdk.respondToAsk(permEvent.askId, { granted: false });

    // LLM call #2: sees tool error result
    const call2 = await sandbox.next();
    const lastMsg = call2.context.messages[call2.context.messages.length - 1];
    expect(JSON.stringify(lastMsg)).toContain('denied');

    await call2.text("I don't have permission to access that file.");

    await sandbox.close();
  });
});
```

### Pattern 3: Subagent Spawning

```typescript
describe('Sandbox: subagent flow', () => {
  test('task tool spawns child session, depth tracking works', async () => {
    const sandbox = await createSandbox();
    const sdk = createSdkClient();

    const session = await sdk.createSession({ workspaceId: 'test-ws' });

    sdk.sendMessage(session.id, 'Search for TODOs');

    // Parent LLM call: make it call "task" tool
    const parentCall = await sandbox.next();
    expect(parentCall.context.depth).toBe(0);

    await parentCall.toolCall('task', {
      description: 'Find TODOs',
      prompt: 'Search for TODO comments in the codebase',
      subagent_type: 'explore',
    });

    // Child LLM call: the subagent's own LLM call
    const childCall = await sandbox.next({
      filter: { depth: 1 },
    });
    expect(childCall.context.depth).toBe(1);

    await childCall.text('Found 3 TODOs in src/main.ts');

    // Parent LLM call #2: sees subagent result
    const parentCall2 = await sandbox.next({
      filter: { depth: 0 },
    });

    await parentCall2.text('I found 3 TODOs in the codebase.');

    // Verify: child session exists in DB
    const sessions = sdk.getSessions();
    const childSession = sessions.find(s => s.parentId === session.id);
    expect(childSession).toBeDefined();

    await sandbox.close();
  });
});
```

### Pattern 4: Compaction

```typescript
describe('Sandbox: compaction', () => {
  test('auto-compaction triggers when context exceeds threshold', async () => {
    const sandbox = await createSandbox();

    // Auto-respond all primary chat calls with text
    await sandbox.setAutoResponders([
      {
        match: { mode: 'stream', depth: 0 },
        response: { type: 'text', content: 'Acknowledged.' },
        label: 'Auto-respond primary chat',
      },
      {
        match: { mode: 'generate' },
        response: { type: 'text', content: 'Compaction summary of the conversation.' },
        label: 'Auto-respond compaction',
      },
    ]);

    const sdk = createSdkClient();
    const session = await sdk.createSession({ workspaceId: 'test-ws' });

    // Send many messages to exceed context threshold
    for (let i = 0; i < 50; i++) {
      await sdk.sendMessage(session.id, `Message ${i}: `.repeat(100));
    }

    // Wait for compaction to happen (auto-handled)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify: compaction happened
    const messages = sdk.getMessages(session.id);
    const compactionParts = messages.filter(m =>
      m.parts?.some(p => p.type === 'compaction')
    );
    expect(compactionParts.length).toBeGreaterThan(0);

    await sandbox.close();
  });
});
```

### Pattern 5: Error Recovery (Retry)

```typescript
describe('Sandbox: error recovery', () => {
  test('rate limit error triggers retry, then succeeds', async () => {
    const sandbox = await createSandbox();
    const sdk = createSdkClient();

    const session = await sdk.createSession({ workspaceId: 'test-ws' });
    sdk.sendMessage(session.id, 'Do something');

    // First call: trigger rate limit error
    const call1 = await sandbox.next();
    await call1.error('Rate limit exceeded', 'rate_limit');

    // Retry happens automatically via streamChatWithRetry
    // Second call: respond normally
    const call2 = await sandbox.next();
    await call2.text('Done!');

    // Verify: error event was broadcast, then success
    const history = await sandbox.history();
    expect(history.length).toBe(2);
    expect(history[0].response?.type).toBe('error');

    await sandbox.close();
  });
});
```

### Pattern 6: Concurrent Sessions

```typescript
describe('Sandbox: concurrent sessions', () => {
  test('two sessions can be controlled independently', async () => {
    const sandbox = await createSandbox();
    const sdk = createSdkClient();

    const session1 = await sdk.createSession({ workspaceId: 'ws-1' });
    const session2 = await sdk.createSession({ workspaceId: 'ws-2' });

    // Send messages to both sessions
    sdk.sendMessage(session1.id, 'What is 2+2?');
    sdk.sendMessage(session2.id, 'What is the capital of France?');

    // Wait for session1's call
    const call1 = await sandbox.next({
      filter: { sessionId: session1.id },
    });
    await call1.text('The answer is 4.');

    // Wait for session2's call
    const call2 = await sandbox.next({
      filter: { sessionId: session2.id },
    });
    await call2.text('The capital of France is Paris.');

    await sandbox.close();
  });
});
```

## Test Server Lifecycle

For CI, tests need to start/stop the sandbox server:

```typescript
// tests/helpers/sandbox-server.ts

export interface SandboxServer {
  url: string;
  stop(): Promise<void>;
}

export async function startSandboxServer(options?: {
  port?: number;
}): Promise<SandboxServer> {
  const port = options?.port ?? 0; // 0 = random available port

  const proc = Bun.spawn([
    'bun', 'run', 'packages/server/src/index.ts',
  ], {
    env: {
      ...process.env,
      JEAN2_SANDBOX: 'true',
      JEAN2_PORT: String(port),
      JEAN2_DATA_DIR: `/tmp/jean2-sandbox-test-${Date.now()}`,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Wait for server to be ready
  // Read stdout for "Server listening on port XXXX"
  const actualPort = await waitForServer(proc);

  return {
    url: `http://localhost:${actualPort}`,
    async stop() {
      proc.kill();
      await proc.exited;
    },
  };
}
```

### Full Test Setup

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startSandboxServer, type SandboxServer } from '#tests/sandbox-server';
import { createSandbox, type SandboxClient } from '#tests/sandbox-client';
import { createSdkClient, type SdkClient } from '#tests/sdk-client';

describe('Sandbox: permissions', () => {
  let server: SandboxServer;
  let sandbox: SandboxClient;
  let sdk: SdkClient;

  beforeAll(async () => {
    server = await startSandboxServer();
    sandbox = await createSandbox(server.url);
    sdk = createSdkClient(server.url);
  });

  afterAll(async () => {
    await sandbox.close();
    await server.stop();
  });

  test('denied permission returns error to LLM', async () => {
    // ... test code using sandbox and sdk
  });
});
```

## Assertion Helpers

Utility functions for common verification patterns:

```typescript
// tests/helpers/sandbox-assertions.ts

export function assertToolCallInHistory(
  history: SandboxHistoryEntry[],
  toolName: string,
  args?: Partial<Record<string, unknown>>,
): void {
  const entry = history.find(e =>
    e.response?.type === 'tool-call' &&
    (e.response as any).toolName === toolName
  );
  expect(entry).toBeDefined();
  if (args && entry?.response?.type === 'tool-call') {
    expect((entry.response as any).args).toMatchObject(args);
  }
}

export function assertMessageSequence(
  messages: Array<{ role: string }>,
  expected: Array<{ role: string }>,
): void {
  expect(messages.map(m => m.role)).toEqual(expected.map(m => m.role));
}

export function assertBroadcastSequence(
  broadcasts: Array<{ type: string }>,
  expected: Array<{ type: string }>,
): void {
  expect(broadcasts.map(b => b.type)).toEqual(expected.map(b => b.type));
}

export async function waitForEvent(
  broadcasts: Array<{ type: string; [key: string]: unknown }>,
  type: string,
  timeout = 5000,
): Promise<typeof broadcasts[0]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const event = broadcasts.find(b => b.type === type);
    if (event) return event;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout waiting for broadcast event: ${type}`);
}
```

## Test Organization

```
packages/server/tests/
  sandbox/                              ← new directory
    helpers/
      sandbox-server.ts                 — start/stop sandbox server process
      sandbox-client.ts                 — createSandbox() client
      sdk-client.ts                     — SDK client for sending messages, creating sessions
      sandbox-assertions.ts             — assertToolCallInHistory, assertMessageSequence, etc.
    permissions.test.ts                 — permission grant/deny scenarios
    tool-execution.test.ts              — tool call → execute → result flow
    subagent.test.ts                    — subagent spawning, depth limits, cascading
    compaction.test.ts                  — auto-compaction, manual compaction, pruning
    error-recovery.test.ts              — retry, rate limit, timeout, auth error
    interrupt.test.ts                   — user interrupt, cascading to subagents
    multi-session.test.ts               — concurrent sessions, queue management
    ask-response.test.ts                — ask/response flow, timeout, auto-grant
    edge-cases.test.ts                  — deep nesting, empty sessions, malformed input
```

## CI Integration

```yaml
# .github/workflows/test-sandbox.yml
name: Sandbox Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  sandbox:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test packages/server/tests/sandbox/
        env:
          JEAN2_SANDBOX: 'true'
        timeout-minutes: 10
```

The sandbox tests start their own server processes, so they don't interfere with other test suites.
