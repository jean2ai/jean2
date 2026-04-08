# @jean2/sdk-cli

CLI utilities for building terminal applications with `@jean2/sdk`. Zero runtime dependencies — uses Node.js/Bun built-in `readline`.

## Installation

```bash
bun add @jean2/sdk-cli
# or
npm install @jean2/sdk-cli
```

Requires `@jean2/sdk` (auto-installed as workspace dependency in monorepo).

## Formatters

Pretty-print messages, tool calls, and session headers.

```typescript
import { formatMessage, formatToolCall, formatSessionHeader } from '@jean2/sdk-cli';

console.log(formatMessage(message, { color: true, maxWidth: 80, showTimestamp: false }));
console.log(formatToolCall(toolPart, { color: true, maxWidth: 60 }));
console.log(formatSessionHeader(session));
```

## Chat Loop

Interactive chat loop with streaming, permissions, and connection handling.

```typescript
import { createChatLoop } from '@jean2/sdk-cli';

const handle = createChatLoop(client, {
  sessionId: 'abc123',        // resume existing, or omit to create new
  prompt: '> ',               // input prompt
  onMessage: (msg) => console.log(formatMessage(msg)),
  onToolCall: (part) => console.log(formatToolCall(part)),
  onPermissionRequest: (req) => {
    return req.toolName === 'safe_tool';
  },
  onError: (err) => console.error(err),
  exitCommands: ['/exit', '/quit'],
});

handle.stop();
```

The chat loop handles:
- Streaming text output (writes deltas in real-time)
- Permission request prompts (interactive y/n)
- Connection state changes (disconnected/reconnecting/reconnected)
- Tool call display

## ANSI Helpers

Strip ANSI escape codes from strings.

```typescript
import { stripAnsi } from '@jean2/sdk-cli';

const clean = stripAnsi('\x1b[32mgreen text\x1b[39m'); // 'green text'
```
