import type { Hono } from 'hono';
import { randomUUID } from 'crypto';
import {
  listResponseFormats,
  getResponseFormat,
  createResponseFormat,
  updateResponseFormat,
  deleteResponseFormat,
} from '@/store';

export function registerResponseFormatRoutes(app: Hono): void {
  // GET /api/response-formats - List all response formats
  app.get('/api/response-formats', async (c) => {
    try {
      const formats = listResponseFormats();
      return c.json({ formats });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list response formats', message }, 500);
    }
  });

  // GET /api/response-formats/:id - Get a specific response format
  app.get('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const format = getResponseFormat(id);
      if (!format) {
        return c.json({ error: 'Not Found', message: 'Response format not found' }, 404);
      }
      return c.json({ format });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get response format', message }, 500);
    }
  });

  // POST /api/response-formats - Create a new response format
  app.post('/api/response-formats', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, description, schema } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ error: 'Bad Request', message: 'Name is required' }, 400);
    }
    if (!schema || typeof schema !== 'object') {
      return c.json({ error: 'Bad Request', message: 'Schema is required and must be a JSON Schema object' }, 400);
    }

    try {
      const format = createResponseFormat({
        id: randomUUID(),
        name: name.trim(),
        description: description?.trim() || undefined,
        schema: schema as Record<string, unknown>,
      });
      return c.json({ format }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create response format', message }, 500);
    }
  });

  // PUT /api/response-formats/:id - Update a response format
  app.put('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { name, description, schema } = body;

    try {
      const updated = updateResponseFormat(id, {
        name: name?.trim() || undefined,
        description: description !== undefined ? description?.trim() : undefined,
        schema: schema || undefined,
      });
      if (!updated) {
        return c.json({ error: 'Not Found', message: 'Response format not found' }, 404);
      }
      return c.json({ format: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update response format', message }, 500);
    }
  });

  // DELETE /api/response-formats/:id - Delete a response format
  app.delete('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const deleted = deleteResponseFormat(id);
      if (!deleted) {
        return c.json({ error: 'Not Found', message: 'Response format not found' }, 404);
      }
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete response format', message }, 500);
    }
  });
}
