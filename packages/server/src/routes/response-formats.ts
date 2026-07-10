import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'crypto';
import {
  listResponseFormats,
  getResponseFormat,
  createResponseFormat,
  updateResponseFormat,
  deleteResponseFormat,
} from '@/store';
import { NotFoundError } from '@/utils/http-errors';
import { createResponseFormatSchema, updateResponseFormatSchema } from './schemas';

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

  app.post(
    '/api/response-formats',
    zValidator('json', createResponseFormatSchema),
    async (c) => {
      const body = c.req.valid('json');

      const format = createResponseFormat({
        id: randomUUID(),
        name: body.name.trim(),
        description: body.description?.trim() || undefined,
        schema: body.schema as Record<string, unknown>,
      });
      return c.json({ format }, 201);
    },
  );

  app.put(
    '/api/response-formats/:id',
    zValidator('json', updateResponseFormatSchema),
    async (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');

      const updated = updateResponseFormat(id, {
        name: body.name?.trim() || undefined,
        description: body.description !== undefined ? body.description?.trim() : undefined,
        schema: body.schema || undefined,
      });
      if (!updated) {
        throw new NotFoundError('Response format not found');
      }
      return c.json({ format: updated });
    },
  );

  app.delete('/api/response-formats/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = deleteResponseFormat(id);
    if (!deleted) {
      throw new NotFoundError('Response format not found');
    }
    return c.json({ success: true });
  });
}
