# @jean2/sdk-react

React hooks for `@jean2/sdk` state management. Uses `useSyncExternalStore` (React 18+) with zero additional runtime dependencies.

## Installation

```bash
bun add @jean2/sdk-react
# or
npm install @jean2/sdk-react
```

Peer dependencies: `react >= 18`, `@jean2/sdk`.

## Usage

### Provider

```typescript
import { Jean2ClientProvider } from '@jean2/sdk-react';

<Jean2ClientProvider client={client}>
  <App />
</Jean2ClientProvider>
```

### Connection State

```typescript
import { useJean2Client, useConnectionState } from '@jean2/sdk-react';

const client = useJean2Client();

const { state, connected, reconnecting } = useConnectionState();
// state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'reconnecting'
```

### Session Manager

```typescript
import { useSessionManager } from '@jean2/sdk-react';

const { sessions, active, manager } = useSessionManager({ maxSessions: 100 });
manager.setActive(sessionId);
```

### Message Store

```typescript
import { useMessageStore } from '@jean2/sdk-react';

const { sessionIds, getForSession, getPart, isStreaming, manager } = useMessageStore({ maxSessions: 50 });
const messages = getForSession(sessionId);
const streaming = isStreaming(sessionId);
```

### Permission Tracker

```typescript
import { usePermissionTracker } from '@jean2/sdk-react';

const { pendingRequests, hasPending, getPermissions, getQueue, manager } = usePermissionTracker();
const perms = getPermissions(workspaceId);
const queue = getQueue(sessionId);
```

### Single Session

```typescript
import { useSession } from '@jean2/sdk-react';

const { session, status, isActive, isClosed } = useSession(sessionId);
```

### Messages

```typescript
import { useMessages } from '@jean2/sdk-react';

const { messages, isStreaming } = useMessages(sessionId);
```

### Send Messages

```typescript
import { useChat } from '@jean2/sdk-react';

const { send, interrupt, isStreaming } = useChat(sessionId, { onError });

send('Hello!');
send('With file', [{ id: 'att-id', kind: 'file' }]);
interrupt();
```

### Conditional Hooks

All state hooks accept `{ enabled?: boolean }` to conditionally disable them.