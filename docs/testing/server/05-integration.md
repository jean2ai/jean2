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

Don't try to spin up a real WebSocket server in tests. Instead, extract and test the message handler logic directly. The handlers in `index.ts` currently handle these `ClientMessage` types:

| Message Type | Handler Logic |
|-------------|---------------|
| `chat.send` | Creates user message, starts streaming |
| `chat.interrupt` | Interrupts active session |
| `chat.compact` | Triggers manual compaction |
| `chat.revert` | Reverts to earlier message |
| `chat.fork` | Forks session at message |
| `ask.response` | Resolves pending ask |
| `permission.grant` | Grants tool permission |
| `queue.add` | Adds message to queue |

### Refactoring for Testability

The current `index.ts` has all handler logic inline. To make it testable, extract handlers:

```typescript
// src/core/message-router.ts (new file)

export interface MessageHandlerContext {
  broadcast: (message: ServerMessage, excludeWs?: unknown) => void;
  getSession: typeof getSession;
  createSession: typeof createSession;
  // ... other store functions
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

This way you can test each handler with a mock context:

```typescript
import { handleChatSend } from '@/core/message-router';

describe('chat.send handler', () => {
  test('creates user message and queues chat', async () => {
    const broadcastMessages: ServerMessage[] = [];
    const ctx = {
      broadcast: (msg: ServerMessage) => broadcastMessages.push(msg),
      // ... real store functions with in-memory DB
    };

    await handleChatSend('sess1', 'Hello', [], ctx);

    // Verify user message was created
    // Verify broadcast was called with message.created
    // Verify chat was queued/started
  });
});
```

## Key Integration Scenarios to Test

### 1. Full Chat Send Flow

```
1. Client sends chat.send
2. Server creates user message in DB
3. Server broadcasts message.created to all clients
4. Server starts streamChat
5. Server broadcasts message.created (assistant) with status=streaming
6. Server broadcasts part.created events as text streams
7. Server broadcasts part.created for tool calls
8. Server broadcasts message.updated with status=completed
```

### 2. Compaction Flow

```
1. Client sends chat.compact
2. Server creates compaction trigger message
3. Server broadcasts trigger message
4. Server calls LLM for summary
5. Server creates summary message
6. Server broadcasts summary message
7. Server marks old tool outputs as compacted
```

### 3. Interrupt Flow

```
1. Chat is streaming
2. Client sends chat.interrupt
3. Server aborts the stream
4. Server marks pending/running tools as interrupted
5. Server broadcasts interrupted events
6. Server updates message status to interrupted
```

### 4. Ask/Response Flow

```
1. Tool execution needs user input
2. Server creates pending ask in DB
3. Server broadcasts ask.created to clients
4. Client sends ask.response
5. Server resolves the pending ask
6. Tool execution continues with user's answer
```

### 5. Permission Grant Flow

```
1. Tool needs permission for operation
2. Server sends permission.request to client
3. Client sends permission.grant
4. Server creates grant in DB
5. Tool execution continues
```

## Testing the WebSocket Upgrade

For true end-to-end WebSocket testing, use Bun's built-in WebSocket client:

```typescript
import { describe, test, expect } from 'bun:test';
import { createApp } from '@/app';
// ... setup server

describe('WebSocket integration', () => {
  test('connects and receives messages', async () => {
    // Start the server
    // Connect a WebSocket client
    // Send a chat.send message
    // Verify response events are received
  });
});
```

> **Note:** Full WebSocket integration tests are the most complex to set up. Start with extracted message handler tests and add full WS tests only for the most critical flows.

## Estimated Effort

| Scenario | Test Cases | Time |
|----------|------------|------|
| Chat send flow | 3 | 30 min |
| Compaction flow | 2 | 25 min |
| Interrupt flow | 2 | 20 min |
| Ask/response flow | 2 | 20 min |
| Permission flow | 2 | 15 min |
| Refactoring for testability | — | 60 min |
| **Total** | **~11** | **~170 min** |

11 integration tests covering the 5 most important user-facing flows. These are the "does the whole thing actually work" tests.
