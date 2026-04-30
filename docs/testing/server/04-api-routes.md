# 04 — API Route Tests

Test the REST API endpoints defined in `app.ts` (~500 lines). Hono has built-in test helpers — no supertest needed.

## How Hono Testing Works

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp } from '@/app';

describe('API routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    // Reset DB, set up test data, etc.
  });

  test('GET /api/health returns healthy', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});
```

The key is `app.request(path)` — Hono handles the request through the full middleware chain (CORS, auth, routing) without starting a real HTTP server.

## Auth Considerations

Most routes require authentication (`requireAuth` middleware). For tests, either:

1. **Disable auth** — set `JEAN2_DISABLE_AUTH=true` in test env
2. **Generate a test token** — use `initializeToken()` + `validateToken()` from auth module
3. **Mock the middleware** — replace `requireAuth` in tests

Option 1 is simplest for route tests:

```typescript
beforeEach(() => {
  process.env.JEAN2_DISABLE_AUTH = 'true';
  app = createApp();
});

afterEach(() => {
  delete process.env.JEAN2_DISABLE_AUTH;
});
```

## Routes to Test

### Health & Info (quick wins)

```typescript
describe('Health & Info', () => {
  test('GET / returns server info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
  });

  test('GET /api/health returns healthy', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  test('GET /api/info returns server capabilities', async () => {
    const res = await app.request('/api/info');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features.sessions).toBe(true);
  });
});
```

### Sessions API

```typescript
describe('Sessions API', () => {
  test('POST /api/sessions creates a session', async () => {
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Session' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.title).toBe('Test Session');
  });

  test('GET /api/sessions lists sessions', async () => {
    // Create a session first
    await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toBeInstanceOf(Array);
  });

  test('GET /api/sessions/:id returns 404 for missing', async () => {
    const res = await app.request('/api/sessions/nonexistent');
    expect(res.status).toBe(404);
  });

  test('PUT /api/sessions/:id updates title', async () => {
    // Create session, then update
    const createRes = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 's1' }),
    });
    const { session } = await createRes.json();

    const updateRes = await app.request(`/api/sessions/${session.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.session.title).toBe('Updated');
  });

  test('DELETE /api/sessions/:id deletes session', async () => {
    const createRes = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 's1' }),
    });
    const { session } = await createRes.json();

    const deleteRes = await app.request(`/api/sessions/${session.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);

    const getRes = await app.request(`/api/sessions/${session.id}`);
    expect(getRes.status).toBe(404);
  });

  test('GET /api/sessions/grouped requires workspaceIds', async () => {
    const res = await app.request('/api/sessions/grouped');
    expect(res.status).toBe(400);
  });
});
```

### Workspaces API

```typescript
describe('Workspaces API', () => {
  test('GET /api/workspaces auto-creates default if none exist', async () => {
    const res = await app.request('/api/workspaces');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaces.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/workspaces creates workspace', async () => {
    const res = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', path: '/tmp/test-ws' }),
    });
    expect(res.status).toBe(201);
  });

  test('PUT /api/workspaces/:id updates name', async () => {
    // Create, then update
  });

  test('DELETE /api/workspaces/:id cascades to sessions', async () => {
    // Create workspace + sessions, delete workspace, verify sessions gone
  });
});
```

### Messages API

```typescript
describe('Messages API', () => {
  test('GET /api/sessions/:id/messages returns messages', async () => {
    // Create session + messages, then fetch
  });

  test('POST /api/sessions/:id/attachments uploads file', async () => {
    // Create session, upload FormData with file
  });

  test('GET /api/sessions/:id/attachments/:attId/content returns file', async () => {
    // Create session, upload, then fetch content
  });
});
```

### Config API

```typescript
describe('Config API', () => {
  test('GET /api/models returns model list', async () => {
    const res = await app.request('/api/models');
    // May fail if models.json not configured - that's OK to test
  });

  test('GET /api/preconfigs returns preconfig list', async () => {
    const res = await app.request('/api/preconfigs');
    expect(res.status).toBe(200);
  });

  test('GET /api/tools returns tool list', async () => {
    const res = await app.request('/api/tools');
    expect(res.status).toBe(200);
  });
});
```

## Estimated Effort

| Route Group | Endpoints | Test Cases | Time |
|-------------|-----------|------------|------|
| Health & Info | 3 | 3 | 10 min |
| Sessions | 5 | 8 | 20 min |
| Workspaces | 4 | 6 | 15 min |
| Messages | 3 | 4 | 15 min |
| Config | 5 | 5 | 15 min |
| Auth | 2 | 3 | 10 min |
| **Total** | **22** | **~29** | **~85 min** |

29 test cases ensuring the API layer works correctly. These catch regressions in route handling, auth middleware, request parsing, and response formatting.
