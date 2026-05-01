# 03 — Interactive Control

The control API and standalone CLI tool that let developers manually drive the sandbox in real-time. No scripts, no automation, just you typing commands to test behaviors.

## Why a Standalone CLI (Not a Client Panel)

The control surface is a **separate process** — a CLI tool — not embedded in the React client. This is a deliberate design decision:

| | Web Panel (in client) | Standalone CLI |
|---|---|---|
| **Client changes** | SDK, stores, components, routing | Zero |
| **What you're testing** | A modified client with sandbox code | The real, unmodified client |
| **Speed** | Click through forms | Type a command, instant |
| **Scriptability** | Can't script a UI | Pipe commands, write test scripts |
| **Setup** | SDK changes + React + Zustand + routing | One Bun script |
| **CI** | Can't run a browser in CI | CLI is CI-native |
| **Debugging** | Hard to see raw messages | See everything in terminal |

The whole point of the sandbox is that the client works normally. If you add sandbox code to the client, you're testing a different client.

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌───────────────────┐
│  Client     │         │  Server          │         │  Sandbox CLI      │
│  (normal)   │── WS ──▶│  (sandbox mode)  │◀─ HTTP ─│  bun run sandbox  │
│             │         │                  │         │                   │
│  User types │◀─ WS ──│  Control API     │         │  Reads pending    │
│  messages   │         │  /api/sandbox/*  │         │  calls, sends     │
│             │         │                  │         │  responses        │
│  Sees real  │         │  WebSocket       │◀─ WS ──│  Gets real-time   │
│  responses  │         │  sandbox events  │         │  notifications    │
└─────────────┘         └──────────────────┘         └───────────────────┘
```

The CLI connects to the server's control API (REST + WebSocket). The client connects normally. They're completely independent processes.

## Control API (`sandbox/routes.ts`)

### REST Endpoints

All endpoints are prefixed with `/api/sandbox/` and only registered when `JEAN2_SANDBOX=true`.

#### `GET /api/sandbox/status`

Returns current sandbox state.

```typescript
// Response
{
  active: true;
  pendingCallCount: number;
  totalCallsHandled: number;
}
```

#### `GET /api/sandbox/pending`

Returns all LLM calls currently waiting for a response.

```typescript
// Response
Array<LlmCallContext>
```

#### `GET /api/sandbox/pending/:callId`

Returns full context for a specific pending call.

```typescript
// Response
LlmCallContext

// 404 if call not found or already responded
```

#### `POST /api/sandbox/pending/:callId/respond`

Submit a response to a pending call. This unblocks the server's LLM call.

```typescript
// Request body
SandboxResponse

// Example: text response
{
  "type": "text",
  "content": "I've analyzed the file."
}

// Example: tool call
{
  "type": "tool-call",
  "toolName": "read-file",
  "args": { "path": "/workspace/test.ts" }
}

// Example: error
{
  "type": "error",
  "error": "Rate limit exceeded",
  "errorType": "rate_limit"
}

// Response: 200 OK
{ "ok": true }

// Response: 404 if call not found
{ "ok": false, "error": "No pending call with id: ..." }
```

#### `GET /api/sandbox/history`

Returns the full interaction history.

```typescript
// Response
Array<SandboxHistoryEntry>
```

#### `DELETE /api/sandbox/history`

Clears history. Useful between test scenarios.

```typescript
// Response
{ "ok": true }
```

#### `GET /api/sandbox/auto-responder`

Returns current auto-responder rules.

```typescript
// Response
Array<AutoResponderRule>
```

#### `PUT /api/sandbox/auto-responder`

Set auto-responder rules. These match incoming calls and auto-respond without waiting for manual input.

```typescript
// Request body
{
  "rules": Array<AutoResponderRule>
}

// Response
{ "ok": true }
```

### WebSocket Channel

The REST API is for querying state. For real-time notifications, the CLI connects via WebSocket:

**Server → CLI:**
```
sandbox.call_waiting     — new LLM call is waiting for input
sandbox.call_completed   — a call's response was consumed
```

**CLI → Server:**
```
sandbox.respond          — respond to a pending call
```

This piggybacks on the existing WebSocket connection in `index.ts`. The `handleClientMessage` router gets new message types.

### Route Registration

```typescript
// sandbox/routes.ts
import type { Hono } from 'hono';

export function registerSandboxRoutes(app: Hono): void {
  app.get('/api/sandbox/status', (c) => { ... });
  app.get('/api/sandbox/pending', (c) => { ... });
  app.get('/api/sandbox/pending/:callId', (c) => { ... });
  app.post('/api/sandbox/pending/:callId/respond', async (c) => { ... });
  app.get('/api/sandbox/history', (c) => { ... });
  app.delete('/api/sandbox/history', (c) => { ... });
  app.get('/api/sandbox/auto-responder', (c) => { ... });
  app.put('/api/sandbox/auto-responder', async (c) => { ... });
}
```

Registered in `app.ts`:
```typescript
if (process.env.JEAN2_SANDBOX === 'true') {
  const { registerSandboxRoutes } = await import('@/sandbox/routes');
  registerSandboxRoutes(app);
}
```

## Auto-Responder System

Not every LLM call needs manual control. Some calls (compaction summaries, tool LLM API calls) are infrastructure — you want them to auto-respond while you focus on the main chat flow.

### AutoResponderRule

```typescript
export interface AutoResponderRule {
  /** What calls this rule matches */
  match: {
    mode?: 'stream' | 'generate';        // stream vs generate calls
    depth?: number | number[];            // call depth (0=primary, 1=subagent)
    sessionId?: string | string[];        // specific sessions
    hasToolResults?: boolean;             // calls that have tool results in context
  };

  /** What response to send */
  response: SandboxResponse;

  /** Optional: only auto-respond this many times, then remove rule */
  maxUses?: number;

  /** Optional: human-readable label */
  label?: string;
}
```

### Default Auto-Responders

When the sandbox activates, it installs sensible defaults:

```typescript
const DEFAULT_AUTO_RESPONDERS: AutoResponderRule[] = [
  {
    label: 'Auto-respond compaction',
    match: { mode: 'generate' },
    response: { type: 'text', content: 'Summary of the conversation so far.' },
  },
];
```

Compaction calls use `generateText` → `mode: 'generate'`. Auto-responding them means you can focus on the chat flow.

### Auto-Responder Matching Logic

When a new call arrives in `SandboxController.waitForResponse()`:

```typescript
async waitForResponse(context: LlmCallContext): Promise<SandboxResponse> {
  // Check auto-responders first
  const rule = this.findMatchingRule(context);
  if (rule) {
    rule.uses = (rule.uses ?? 0) + 1;
    if (rule.maxUses && rule.uses >= rule.maxUses) {
      this.removeAutoResponderRule(rule);
    }
    return rule.response;
  }

  // No auto-responder — block for manual/scripted input
  return new Promise((resolve) => {
    this.pendingCalls.set(context.callId, { context, resolve });
    // ...
  });
}
```

## Sandbox CLI (`packages/sandbox-cli/`)

A standalone package in the monorepo that connects to the server's control API. Lives in `packages/sandbox-cli/` — independent from both the server and the client packages. Same pattern as `packages/client-electron` and `packages/client-tauri`: its own package with its own `package.json`, talking to the server via REST/WebSocket.

### Location

```
packages/sandbox-cli/
  package.json       — standalone package (@jean2/sandbox-cli, depends on @jean2/sdk for types)
  src/
    cli.ts           — entry point, argument parsing, REPL loop
    api-client.ts    — HTTP + WebSocket client for the control API
    commands.ts      — command handlers (respond, history, auto-responder, etc.)
    display.ts       — terminal formatting (pending calls, history, status)
    types.ts         — re-exports from sandbox protocol types (or duplicates the small subset needed)
```

### Running

```bash
# Start the sandbox server in one terminal
JEAN2_SANDBOX=true bun run dev:server

# In another terminal, start the CLI
bun packages/sandbox-cli/src/cli.ts --port 3000

# Or with defaults (localhost:3000)
bun packages/sandbox-cli/src/cli.ts
```

### Interactive Session

```
$ bun packages/sandbox-cli/src/cli.ts --port 3000

🎛️  Jean2 Sandbox CLI — connected to localhost:3000
Type "help" for commands.

─────────────────────────────────────────────────
⏳  PENDING (2 calls)

  #1  session: abc-123  depth: 0  mode: stream
      Tools: read-file, edit, shell, grep, glob, ls, ...
      Last message: "Read the file at /workspace/config.json"

  #2  session: def-456  depth: 0  mode: stream
      Tools: read-file, edit, shell, grep, glob, ls, ...
      Tool result: read-file → "file contents here"

─────────────────────────────────────────────────
sandbox> respond 1 tool-call read-file '{"path":"config.json"}'
✓ Response sent. Tool executing...

sandbox>
🔔  New call #3 — session: abc-123, depth: 0
    Tool result: read-file → { success: true, result: '{"name":"jean2",...}' }

sandbox> respond 3 text "The config contains the project settings."
✓ Response sent. Message completed.

sandbox> history
  #1  tool-call read-file  →  completed
  #3  text "The config..." →  completed

sandbox> auto-respond mode:generate "Summary of conversation."
✓ Auto-responder rule set for all generate calls.

sandbox>
```

### Commands

The CLI supports these commands:

#### `respond <callId> <type> [args]`

Respond to a pending LLM call.

```bash
# Text response
sandbox> respond 1 text "I've analyzed the file."

# Tool call — tool name + JSON args
sandbox> respond 1 tool-call read-file '{"path":"/workspace/test.ts"}'

# Error response
sandbox> respond 1 error "Rate limit exceeded" --type rate_limit

# Respond to the most recent pending call (no ID needed)
sandbox> respond text "Done."
sandbox> respond tool-call read-file '{"path":"config.json"}'
```

Shorthand aliases: `r` for `respond`, `t` for `text`, `tc` for `tool-call`, `e` for `error`.

```bash
sandbox> r t "Done."
sandbox> r tc read-file '{"path":"config.json"}'
```

#### `pending` / `p`

Show all pending LLM calls.

```bash
sandbox> pending

⏳  PENDING (2 calls)

  #abc123  session: s-001  depth: 0  mode: stream
           Tools: read-file, edit, shell, grep, ...
           Last message: "Read the config file"

  #def456  session: s-001  depth: 1  mode: stream
           Tools: read-file, grep
           Prompt: "Find all TODO comments"
```

#### `history` / `h`

Show interaction history.

```bash
sandbox> history

✅  HISTORY (3 entries)

  #abc123  tool-call read-file  →  completed  (2.1s)
  #ghi789  text "Done."         →  completed  (0.3s)
  #def456  text "Found 3 TODOs" →  completed  (1.2s)
```

#### `call <callId>`

Show detailed context for a specific call.

```bash
sandbox> call abc123

  Call #abc123
  Session: s-001  Depth: 0  Mode: stream
  Model: sandbox  Provider: sandbox
  Timestamp: 2024-01-15T10:30:00Z

  Messages (4):
    [system] You are a helpful coding assistant...
    [user]    What files are in the project?
    [assistant] I'll check the directory structure.
    [tool-result] ls → { success: true, result: "src/ package.json ..." }

  Available tools: read-file, edit, shell, grep, glob, ls, ...
```

#### `auto-respond [match] <response>`

Set an auto-responder rule.

```bash
# Auto-respond all generate calls (compaction)
sandbox> auto-respond mode:generate "Summary of conversation."

# Auto-respond all subagent calls
sandbox> auto-respond depth:1 "Task completed successfully."

# Auto-respond specific session
sandbox> auto-respond session:s-001 "Done."

# Auto-respond with tool call
sandbox> auto-respond mode:stream tool-call read-file '{"path":"config.json"}'

# Clear all auto-responders
sandbox> auto-respond clear

# List current rules
sandbox> auto-respond list
```

#### `status` / `s`

Show sandbox status.

```bash
sandbox> status

🎛️  Sandbox Status
  Active: true
  Pending calls: 2
  Total handled: 5
  Auto-responders: 1 (compaction)
```

#### `clear`

Clear interaction history.

```bash
sandbox> clear
✓ History cleared.
```

#### `help`

Show available commands.

### Real-Time Notifications

The CLI subscribes to WebSocket events from the server. When a new LLM call blocks, the CLI prints a notification immediately:

```
sandbox>
🔔  New call #xyz789 — session: s-001, depth: 0
    Tools: read-file, edit, shell
    Last message: "Fix the bug in utils.ts"
```

This happens without polling — the CLI maintains a WebSocket connection alongside the REST API calls.

### Implementation

#### `api-client.ts` — HTTP + WebSocket client

```typescript
export class SandboxApiClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private onCallWaiting: ((context: LlmCallContext) => void) | null = null;

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}/api/sandbox`;
  }

  async connect(): Promise<void> {
    // Connect WebSocket for real-time events
    const wsUrl = `ws://${this.host}:${this.port}/ws`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'sandbox.call_waiting' && this.onCallWaiting) {
        this.onCallWaiting(msg.context);
      }
    };
  }

  async getStatus(): Promise<SandboxStatus> { ... }
  async getPendingCalls(): Promise<LlmCallContext[]> { ... }
  async getPendingCall(callId: string): Promise<LlmCallContext | null> { ... }
  async respond(callId: string, response: SandboxResponse): Promise<void> { ... }
  async getHistory(): Promise<SandboxHistoryEntry[]> { ... }
  async clearHistory(): Promise<void> { ... }
  async getAutoResponderRules(): Promise<AutoResponderRule[]> { ... }
  async setAutoResponderRules(rules: AutoResponderRule[]): Promise<void> { ... }

  onCallWaitingEvent(handler: (context: LlmCallContext) => void): void {
    this.onCallWaiting = handler;
  }
}
```

#### `cli.ts` — REPL loop

```typescript
import { SandboxApiClient } from './api-client';
import { handleCommand } from './commands';
import { displayPendingCalls, displayNotification } from './display';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new SandboxApiClient(args.host, args.port);

  await client.connect();
  console.log(`🎛️  Jean2 Sandbox CLI — connected to ${args.host}:${args.port}`);
  console.log('Type "help" for commands.\n');

  // Show initial pending calls
  const pending = await client.getPendingCalls();
  if (pending.length > 0) displayPendingCalls(pending);

  // Real-time notifications
  client.onCallWaitingEvent((context) => {
    displayNotification(context);
  });

  // REPL
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.setPrompt('sandbox> ');
  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    try {
      await handleCommand(client, trimmed);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }

    rl.prompt();
  });
}

main().catch(console.error);
```

#### `commands.ts` — command parsing and execution

```typescript
import type { SandboxApiClient } from './api-client';
import { displayPendingCalls, displayHistory, displayStatus, displayCallDetail } from './display';

export async function handleCommand(client: SandboxApiClient, input: string): Promise<void> {
  const tokens = tokenize(input);
  const cmd = tokens[0]?.toLowerCase();

  switch (cmd) {
    case 'respond':
    case 'r':
      return handleRespond(client, tokens.slice(1));

    case 'pending':
    case 'p':
      return handlePending(client);

    case 'history':
    case 'h':
      return handleHistory(client);

    case 'call':
      return handleCallDetail(client, tokens[1]);

    case 'auto-respond':
      return handleAutoRespond(client, tokens.slice(1));

    case 'status':
    case 's':
      return handleStatus(client);

    case 'clear':
      return handleClear(client);

    case 'help':
      return displayHelp();

    default:
      console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
  }
}

async function handleRespond(client: SandboxApiClient, tokens: string[]): Promise<void> {
  // Parse: [callId] <type> [args...]
  // "text Hello world"
  // "1 text Hello world"
  // "tool-call read-file {\"path\":\"test.ts\"}"
  // "error Rate limit exceeded --type rate_limit"

  let callId: string | undefined;
  let responseType: string;
  let rest: string[];

  // Check if first token looks like a call ID (alphanumeric, not a known type)
  const knownTypes = ['text', 't', 'tool-call', 'tc', 'error', 'e', 'reasoning'];
  if (!knownTypes.includes(tokens[0]?.toLowerCase())) {
    callId = tokens[0];
    responseType = tokens[1]?.toLowerCase();
    rest = tokens.slice(2);
  } else {
    responseType = tokens[0]?.toLowerCase();
    rest = tokens.slice(1);
  }

  // If no callId, use the most recent pending call
  if (!callId) {
    const pending = await client.getPendingCalls();
    if (pending.length === 0) throw new Error('No pending calls');
    callId = pending[pending.length - 1].callId;
  }

  let response: SandboxResponse;
  switch (responseType) {
    case 'text':
    case 't':
      response = { type: 'text', content: rest.join(' ') };
      break;

    case 'tool-call':
    case 'tc':
      if (rest.length < 2) throw new Error('Usage: tool-call <toolName> <jsonArgs>');
      response = {
        type: 'tool-call',
        toolName: rest[0],
        args: JSON.parse(rest.slice(1).join(' ')),
      };
      break;

    case 'error':
    case 'e':
      response = { type: 'error', error: rest.join(' ') || 'Unknown error' };
      break;

    default:
      throw new Error(`Unknown response type: ${responseType}`);
  }

  await client.respond(callId, response);
  console.log(`✓ Response sent to call #${callId.slice(0, 8)}`);
}

// ... other command handlers
```

#### `display.ts` — terminal formatting

```typescript
import type { LlmCallContext, SandboxHistoryEntry } from './types';

export function displayPendingCalls(calls: LlmCallContext[]): void {
  if (calls.length === 0) {
    console.log('  No pending calls.');
    return;
  }

  console.log(`\n⏳  PENDING (${calls.length} calls)\n`);

  for (const call of calls) {
    const depthLabel = call.depth === 0 ? 'primary' : `subagent (depth ${call.depth})`;
    const toolList = call.tools.length > 5
      ? call.tools.slice(0, 5).map(t => t.name).join(', ') + ', ...'
      : call.tools.map(t => t.name).join(', ');

    console.log(`  #${call.callId.slice(0, 8)}  session: ${call.sessionId.slice(0, 8)}  depth: ${call.depth} (${depthLabel})  mode: ${call.mode}`);
    console.log(`           Tools: ${toolList}`);

    // Show last user message
    const lastUserMsg = [...call.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const content = typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content.slice(0, 80)
        : JSON.stringify(lastUserMsg.content).slice(0, 80);
      console.log(`           Last message: "${content}"`);
    }

    console.log();
  }
}

export function displayNotification(context: LlmCallContext): void {
  const depthLabel = context.depth === 0 ? 'primary' : `subagent depth ${context.depth}`;
  console.log(`\n🔔  New call #${context.callId.slice(0, 8)} — session: ${context.sessionId.slice(0, 8)}, ${depthLabel}`);
  console.log(`    Tools: ${context.tools.map(t => t.name).join(', ')}`);

  const lastUserMsg = [...context.messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    const content = typeof lastUserMsg.content === 'string'
      ? lastUserMsg.content.slice(0, 80)
      : JSON.stringify(lastUserMsg.content).slice(0, 80);
    console.log(`    Last message: "${content}"`);
  }
  console.log();
}

export function displayHistory(entries: SandboxHistoryEntry[]): void {
  if (entries.length === 0) {
    console.log('  No history.');
    return;
  }

  console.log(`\n✅  HISTORY (${entries.length} entries)\n`);

  for (const entry of entries) {
    const id = entry.callId.slice(0, 8);
    const status = entry.response ? 'completed' : 'pending';
    let summary = '';

    if (entry.response?.type === 'text') {
      summary = `text "${entry.response.content.slice(0, 40)}"`;
    } else if (entry.response?.type === 'tool-call') {
      summary = `tool-call ${entry.response.toolName}`;
    } else if (entry.response?.type === 'error') {
      summary = `error "${entry.response.error.slice(0, 40)}"`;
    }

    const duration = entry.completedAt && entry.respondedAt
      ? `  (${((entry.completedAt - entry.respondedAt) / 1000).toFixed(1)}s)`
      : '';

    console.log(`  #${id}  ${summary}  →  ${status}${duration}`);
  }
}

export function displayStatus(status: SandboxStatus): void {
  console.log('\n🎛️  Sandbox Status');
  console.log(`  Active: ${status.active}`);
  console.log(`  Pending calls: ${status.pendingCallCount}`);
  console.log(`  Total handled: ${status.totalCallsHandled}`);
}
```

## Developer Workflow

Here's how a developer would use the sandbox day-to-day:

### 1. Start Sandbox Server
```bash
JEAN2_SANDBOX=true bun run dev:server
```

### 2. Start Client (Normal)
```bash
bun run dev:client
```
The client works normally. No special mode, no sandbox UI. Just the regular chat interface.

### 3. Start Sandbox CLI
```bash
bun packages/sandbox-cli/src/cli.ts --port 3000
```

### 4. Test Permission Flow
```
Terminal 1 (Client):    User types "Read /etc/passwd"
Terminal 2 (CLI):       sandbox> ⏳ Shows pending call with "Read /etc/passwd"

Terminal 2 (CLI):       sandbox> respond 1 tool-call read-file '{"path":"/etc/passwd"}'
                        ✓ Response sent. Tool executing.

Terminal 1 (Client):    Permission dialog appears — user clicks "Deny"

Terminal 2 (CLI):       🔔 New call #2 — tool result: "Permission denied"
                        sandbox> respond 2 text "I don't have permission for that file."
                        ✓ Response sent.

Terminal 1 (Client):    Chat shows "I don't have permission for that file."
```

### 5. Test Subagent Spawning
```
Terminal 1 (Client):    User types "Search the codebase for TODOs"
Terminal 2 (CLI):       sandbox> ⏳ Pending call #1 (depth: 0)

Terminal 2 (CLI):       sandbox> respond 1 tool-call task '{
                          "description": "Find TODOs",
                          "prompt": "Search for TODO comments",
                          "subagent_type": "explore"
                        }'
                        ✓ Response sent. Subagent spawning...

Terminal 2 (CLI):       🔔 New call #2 (depth: 1) — subagent
                        sandbox> respond 2 text "Found 3 TODOs in src/main.ts"
                        ✓ Response sent. Subagent completed.

Terminal 2 (CLI):       🔔 New call #3 (depth: 0) — parent sees result
                        sandbox> respond 3 text "I found 3 TODOs in the codebase."

Terminal 1 (Client):    Chat shows "I found 3 TODOs in the codebase."
```

### 6. Test Compaction
```
Terminal 2 (CLI):       sandbox> auto-respond mode:generate "Summary of conversation."
                        ✓ Auto-responder set.

Terminal 1 (Client):    Send many messages to build context
                        → Compaction triggers automatically
                        → Auto-responder handles the compaction LLM call
                        → Client shows compacted context
```

## Why This is Better Than a Client Panel

1. **You test the real client.** Zero modifications to `@jean2/client` or `@jean2/sdk`. The client works exactly as in production.

2. **Faster iteration.** Type a command, get instant feedback. No clicking through forms, no page loads.

3. **Scriptable.** The same CLI commands work in scripts:
   ```bash
   # Pipe commands from a file
   echo 'respond text "Hello"' | bun packages/sandbox-cli/src/cli.ts
   
   # Or use expect-style automation
   ```

4. **CI-ready.** The test utilities in `04-scripted-tests.md` use the exact same API the CLI uses. No divergence.

5. **Independent evolution.** The CLI can grow features (syntax highlighting, autocomplete, TUI mode) without touching the client or server.

6. **No dependency pollution.** The CLI doesn't need React, Zustand, TanStack Router, or any client dependency. It's a standalone Bun script with zero framework dependencies.
