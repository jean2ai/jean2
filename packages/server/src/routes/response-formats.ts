import type { Hono } from 'hono';
import { randomUUID } from 'crypto';
import {
  listResponseFormats,
  getResponseFormat,
  createResponseFormat,
  updateResponseFormat,
  deleteResponseFormat,
} from '@/store';
import { NotFoundError, BadRequestError } from '@/utils/http-errors';

export function registerResponseFormatRoutes(app: Hono): void {
  app.get('/api/response-formats', async (c) => {
    const formats = listResponseFormats();
    return c.json({ formats });
  });

  app.get('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    const format = getResponseFormat(id);
    if (!format) {
      throw new NotFoundError('Response format not found');
    }
    return c.json({ format });
  });

  app.post('/api/response-formats', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, description, schema } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new BadRequestError('Name is required');
    }
    if (!schema || typeof schema !== 'object') {
      throw new BadRequestError('Schema is required and must be a JSON Schema object');
    }

    const format = createResponseFormat({
      id: randomUUID(),
      name: name.trim(),
      description: description?.trim() || undefined,
      schema: schema as Record<string, unknown>,
    });
    return c.json({ format }, 201);
  });

  app.put('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { name, description, schema } = body;

    const updated = updateResponseFormat(id, {
      name: name?.trim() || undefined,
      description: description !== undefined ? description?.trim() : undefined,
      schema: schema || undefined,
    });
    if (!updated) {
      throw new NotFoundError('Response format not found');
    }
    return c.json({ format: updated });
  });

  app.delete('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = deleteResponseFormat(id);
    if (!deleted) {
      throw new NotFoundError('Response format not found');
    }
    return c.json({ success: true });
  });
}
