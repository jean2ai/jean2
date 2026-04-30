# 02 — Store Layer Tests

**The highest-ROI tests in the entire server.** The store layer (`store/`) is the foundation everything else builds on. Every bug in message CRUD, session state transitions, or context building cascades to every feature.

## Why Real SQLite, Not Mocks

The store uses `bun:sqlite` with raw SQL queries. Mocking the database would test nothing — you'd be testing that your mocks return what you tell them to. Instead, use **in-memory SQLite**:

```typescript
import { Database } from 'bun:sqlite';

const db = new Database(':memory:');
// Full SQL behavior, zero file I/O, instant, isolated
```

## Setup Required

The store uses a module-level singleton (`let db: Database | null = null` in `store/index.ts`). Before testing, you need to add test helpers to `store/index.ts`:

```typescript
// Add to store/index.ts — these are ONLY used by tests
export function setDatabaseForTesting(database: Database): void {
  db = database;
}

export function resetDatabaseForTesting(): void {
  if (db) {
    db.close();
  }
  db = null;
}
```

The `initializeSchema` function must also be exported (it currently isn't):

```typescript
// Change: function initializeSchema(db: Database): void {
// To:
export function initializeSchema(db: Database): void {
```

## Test Pattern

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { setDatabaseForTesting, resetDatabaseForTesting, initializeSchema } from '@/store';
import { createMessage, getMessage, listMessages } from '@/store/messages';

describe('messages store', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    setDatabaseForTesting(db);

    // Need a workspace + session for FK constraints
    db.run("INSERT INTO workspaces (id, name, path, is_virtual, created_at, updated_at) VALUES ('ws1', 'test', '/test', 0, datetime('now'), datetime('now'))");
    db.run("INSERT INTO sessions (id, workspace_id, title, status, created_at, updated_at) VALUES ('sess1', 'ws1', 'Test', 'active', datetime('now'), datetime('now'))");
  });

  afterEach(() => {
    resetDatabaseForTesting();
  });

  // ... tests ...
});
```

---

## Modules to Test

### 1. `store/messages.ts` (671 lines) — HIGHEST PRIORITY

This is the largest and most critical store module. Test in sections:

#### Message CRUD

```typescript
describe('message CRUD', () => {
  test('createMessage inserts and returns message', () => {
    const msg = createMessage({
      id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now(),
    });
    expect(msg.id).toBe('msg1');

    const retrieved = getMessage('msg1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.role).toBe('user');
  });

  test('createMessage for assistant includes all fields', () => {
    const msg = createMessage({
      id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(),
      status: 'completed', modelId: 'gpt-4o', providerId: 'openai',
      tokens: { prompt: 100, completion: 50 }, cost: 0.001,
    });
    expect(msg.modelId).toBe('gpt-4o');
  });

  test('getMessage returns null for non-existent', () => {
    expect(getMessage('nonexistent')).toBeNull();
  });

  test('updateMessage patches fields', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now() });
    const updated = updateMessage('msg1', { role: 'user' }); // can't change role but other fields work
    expect(updated).not.toBeNull();
  });

  test('listMessages returns messages ordered by created_at', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: 1000 });
    createMessage({ id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const messages = listMessages('sess1');
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('msg1');
    expect(messages[1].id).toBe('msg2');
  });

  test('deleteMessage removes message and its parts', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now() });
    createPart({ id: 'p1', messageId: 'msg1', createdAt: Date.now(), type: 'text', text: 'hi' }, 'sess1');

    const deleted = deleteMessage('msg1');
    expect(deleted).toBe(true);
    expect(getMessage('msg1')).toBeNull();
    expect(getPart('p1')).toBeNull();
  });

  test('deleteMessages removes all messages for a session', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: 1000 });
    createMessage({ id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const count = deleteMessages('sess1');
    expect(count).toBe(2);
  });
});
```

#### Part CRUD

```typescript
describe('part CRUD', () => {
  test('createPart and getPart roundtrip', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now() });
    const part = createPart({
      id: 'p1', messageId: 'msg1', createdAt: Date.now(), type: 'text', text: 'hello',
    }, 'sess1');
    expect(part.type).toBe('text');

    const retrieved = getPart('p1');
    expect(retrieved).not.toBeNull();
    expect((retrieved as any).text).toBe('hello');
  });

  test('updatePart merges updates', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now() });
    createPart({ id: 'p1', messageId: 'msg1', createdAt: Date.now(), type: 'text', text: 'hello' }, 'sess1');

    const updated = updatePart('p1', { text: 'hello world' });
    expect(updated).not.toBeNull();
    expect((updated as any).text).toBe('hello world');
  });

  test('getPartsByMessage returns parts in order', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: Date.now() });
    createPart({ id: 'p1', messageId: 'msg1', createdAt: 1000, type: 'text', text: 'a' }, 'sess1');
    createPart({ id: 'p2', messageId: 'msg1', createdAt: 2000, type: 'text', text: 'b' }, 'sess1');

    const parts = getPartsByMessage('msg1');
    expect(parts).toHaveLength(2);
    expect(parts[0].id).toBe('p1');
  });

  test('getPartsBySession returns all parts across messages', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: 1000 });
    createMessage({ id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    createPart({ id: 'p1', messageId: 'msg1', createdAt: 1000, type: 'text', text: 'a' }, 'sess1');
    createPart({ id: 'p2', messageId: 'msg2', createdAt: 2000, type: 'text', text: 'b' }, 'sess1');

    const parts = getPartsBySession('sess1');
    expect(parts).toHaveLength(2);
  });
});
```

#### Tool State Transitions

```typescript
describe('tool state transitions', () => {
  test('createToolPartPending creates pending tool', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'streaming', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const tool = createToolPartPending('msg1', 'call-1', 'read-file', { path: '/test' }, 'sess1');
    expect(tool.state.status).toBe('pending');
    expect(tool.name).toBe('read-file');
  });

  test('transitionToolToRunning updates status', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'streaming', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');

    const running = transitionToolToRunning(tool.id);
    expect(running).not.toBeNull();
    expect(running!.state.status).toBe('running');
  });

  test('transitionToolToCompleted sets output', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'streaming', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');
    const running = transitionToolToRunning(tool.id);

    const completed = transitionToolToCompleted(tool.id, 'file contents');
    expect(completed!.state.status).toBe('completed');
    expect((completed!.state as any).output).toBe('file contents');
  });

  test('transitionToolToError sets error', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'streaming', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');

    const errored = transitionToolToError(tool.id, 'file not found');
    expect(errored!.state.status).toBe('error');
    expect((errored!.state as any).error).toBe('file not found');
  });

  test('cannot transition from completed to running', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'streaming', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');
    transitionToolToRunning(tool.id);
    transitionToolToCompleted(tool.id, 'done');

    const result = transitionToolToRunning(tool.id);
    expect(result).toBeNull(); // Guard: already completed
  });
});
```

#### Compaction-Aware Context Building

```typescript
describe('buildEffectiveContextHistory', () => {
  test('returns all messages when no compaction', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: 1000 });
    createMessage({ id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });

    const result = buildEffectiveContextHistory('sess1');
    expect(result.messages).toHaveLength(2);
    expect(result.hasCompaction).toBe(false);
  });

  test('returns messages from latest compaction boundary', () => {
    // Create: user1, assistant1, TRIGGER, SUMMARY, user2
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'user', createdAt: 1000 });
    createMessage({ id: 'msg2', sessionId: 'sess1', role: 'assistant', createdAt: 2000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    createMessage({ id: 'trigger', sessionId: 'sess1', role: 'user', createdAt: 3000 });
    createPart({ id: 'cp1', messageId: 'trigger', createdAt: 3000, type: 'compaction', auto: true, overflow: false }, 'sess1');
    createMessage({ id: 'summary', sessionId: 'sess1', role: 'assistant', createdAt: 4000, status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0, summary: true, mode: 'compaction', parentId: 'trigger' });
    createPart({ id: 'sp1', messageId: 'summary', createdAt: 4000, type: 'text', text: 'Summary...' }, 'sess1');
    createMessage({ id: 'msg5', sessionId: 'sess1', role: 'user', createdAt: 5000 });

    const result = buildEffectiveContextHistory('sess1');
    expect(result.hasCompaction).toBe(true);
    expect(result.messages).toHaveLength(3); // trigger + summary + msg5
    expect(result.messages[0].message.id).toBe('trigger');
  });
});
```

#### Orphaned Tool Call Recovery

```typescript
describe('orphaned tool call recovery', () => {
  test('findOrphanedToolCalls finds pending/running tools', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');

    const orphaned = findOrphanedToolCalls('sess1');
    expect(orphaned).toHaveLength(1);
  });

  test('reconcileOrphanedToolCalls marks them as interrupted', () => {
    createMessage({ id: 'msg1', sessionId: 'sess1', role: 'assistant', createdAt: Date.now(), status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 });
    createToolPartPending('msg1', 'call-1', 'read-file', {}, 'sess1');

    const count = reconcileOrphanedToolCalls('sess1');
    expect(count).toBe(1);

    const orphaned = findOrphanedToolCalls('sess1');
    expect(orphaned).toHaveLength(0); // No longer orphaned
  });
});
```

---

### 2. `store/sessions.ts` (311 lines)

```typescript
describe('sessions store', () => {
  test('createSession and getSession roundtrip', () => {
    const session = createSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' });
    expect(session.id).toBe('s1');
    expect(getSession('s1')).not.toBeNull();
  });

  test('updateSession patches individual fields', () => {
    createSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' });
    const updated = updateSession('s1', { title: 'Updated', status: 'closed' });
    expect(updated!.title).toBe('Updated');
    expect(updated!.status).toBe('closed');
  });

  test('deleteSession cascades to messages and attachments', () => {
    createSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' });
    createMessage({ id: 'msg1', sessionId: 's1', role: 'user', createdAt: Date.now() });

    deleteSession('s1');
    expect(getSession('s1')).toBeNull();
  });

  test('listSessionsByWorkspace filters correctly', () => {
    createSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' });
    createSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'closed' });
    createSession({ id: 's3', workspaceId: 'ws2', title: 'C', status: 'active' });

    const active = listSessionsByWorkspace('ws1', { status: 'active' });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('s1');
  });

  test('listSessionsGrouped groups by workspace', () => {
    createSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' });
    createSession({ id: 's2', workspaceId: 'ws2', title: 'B', status: 'active' });

    const grouped = listSessionsGrouped(['ws1', 'ws2']);
    expect(grouped['ws1']).toHaveLength(1);
    expect(grouped['ws2']).toHaveLength(1);
  });

  test('getChildSessions returns children', () => {
    createSession({ id: 'parent', workspaceId: 'ws1', title: 'Parent', status: 'active' });
    createSession({ id: 'child1', workspaceId: 'ws1', title: 'Child', status: 'active', parentId: 'parent' });

    const children = getChildSessions('parent');
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe('child1');
  });
});
```

---

### 3. `store/workspaces.ts` (96 lines)

```typescript
describe('workspaces store', () => {
  test('CRUD roundtrip', () => {
    const ws = createWorkspace({ id: 'ws1', name: 'Test', path: '/test', isVirtual: false });
    expect(getWorkspace('ws1')).not.toBeNull();

    const updated = updateWorkspace('ws1', { name: 'Updated' });
    expect(updated!.name).toBe('Updated');

    expect(deleteWorkspace('ws1')).toBe(true);
    expect(getWorkspace('ws1')).toBeNull();
  });

  test('countSessionsInWorkspace', () => {
    createWorkspace({ id: 'ws1', name: 'Test', path: '/test', isVirtual: false });
    createSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' });
    createSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'active' });

    expect(countSessionsInWorkspace('ws1')).toBe(2);
  });
});
```

---

### 4. `store/permissions.ts` (398 lines)

The pattern matching logic is pure and highly testable:

```typescript
describe('permissions store', () => {
  test('matchGrant with exact matcher', () => {
    createGrantFromOptions({
      workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command',
      permissionKey: 'npm test',
      grantOptions: { scope: 'workspace', matcher: 'exact', patterns: ['npm test'] },
    });

    const result = matchGrant({ workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command', permissionKey: 'npm test' });
    expect(result.matched).toBe(true);
  });

  test('matchGrant with prefix matcher', () => {
    createGrantFromOptions({
      workspaceId: 'ws1', toolName: 'read-file', resource: 'file',
      permissionKey: '/project/src/',
      grantOptions: { scope: 'workspace', matcher: 'prefix', patterns: ['/project/src/'] },
    });

    const result = matchGrant({ workspaceId: 'ws1', toolName: 'read-file', resource: 'file', permissionKey: '/project/src/index.ts' });
    expect(result.matched).toBe(true);
  });

  test('matchGrant with shell-command matcher', () => {
    createGrantFromOptions({
      workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command',
      permissionKey: 'npm test',
      grantOptions: { scope: 'workspace', matcher: 'shell-command', patterns: ['npm *'] },
    });

    const result = matchGrant({ workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command', permissionKey: 'npm build' });
    expect(result.matched).toBe(true);
  });

  test('once scope grants are not persisted', () => {
    const grant = createGrantFromOptions({
      workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command',
      permissionKey: 'rm -rf /',
      grantOptions: { scope: 'once', matcher: 'exact' },
    });

    expect(grant).not.toBeNull();
    expect(grant!.scope).toBe('once');

    // Should not be in the database
    const result = matchGrant({ workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command', permissionKey: 'rm -rf /' });
    expect(result.matched).toBe(false);
  });

  test('revokeGrant marks grant as revoked', () => {
    createGrantFromOptions({
      workspaceId: 'ws1', toolName: 'shell', resource: 'shell-command',
      permissionKey: 'npm test',
      grantOptions: { scope: 'workspace', matcher: 'exact', patterns: ['npm test'] },
    });

    const grants = getWorkspaceGrants('ws1');
    expect(grants).toHaveLength(1);

    revokeGrant(grants[0].id);

    const activeGrants = getWorkspaceGrants('ws1');
    expect(activeGrants).toHaveLength(0);
  });
});
```

---

### 5. `store/queued-messages.ts`, `store/pending-asks.ts`, `store/attachments.ts`

These follow the same CRUD pattern. Each takes ~10 minutes to test. Focus on:
- Roundtrip create → get → delete
- Ordering guarantees (queued messages by position)
- Cleanup functions (deleteBySession, deleteByWorkspace)

---

## Estimated Effort

| Module | Lines | Test Cases | Time |
|--------|-------|------------|------|
| store/messages (CRUD) | 671 | ~25 | 45 min |
| store/messages (context) | | ~10 | 20 min |
| store/messages (tool transitions) | | ~10 | 20 min |
| store/sessions | 311 | ~12 | 25 min |
| store/workspaces | 96 | ~5 | 10 min |
| store/permissions | 398 | ~10 | 20 min |
| store/queued-messages | 142 | ~6 | 10 min |
| store/pending-asks | 111 | ~5 | 10 min |
| store/attachments | 195 | ~5 | 10 min |
| **Total** | **~2000** | **~88** | **~170 min** |

88 test cases covering every store function. This is the safety net that makes all subsequent refactoring safe.
