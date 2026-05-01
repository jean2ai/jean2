import type { Hono } from 'hono';
import type { SessionStatus } from '@jean2/sdk';
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  listMessages,
  listSessionsGrouped,
} from '@/store';
import {
  getAttachmentByKey,
  getAttachmentsForSession,
  createAttachment,
  determineKind,
  validateImageMime,
  MAX_ATTACHMENT_SIZE,
} from '@/store';
import { existsSync, readFileSync } from 'fs';

export function registerSessionRoutes(app: Hono): void {
  // GET /api/sessions - List all sessions
  app.get('/api/sessions', async (c) => {
    try {
      const status = c.req.query('status') as SessionStatus | undefined;
      const sessions = listSessions(status);
      return c.json({ sessions });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.log('\n');
      console.log('========== SESSIONS ERROR ==========');
      console.log('Error:', message);
      console.log('Stack:', stack);
      console.log('====================================\n');
      return c.json({ error: 'Internal error', message }, 500);
    }
  });

  // POST /api/sessions - Create a new session
  app.post('/api/sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));

    const session = createSession({
      id: body.id || crypto.randomUUID(),
      workspaceId: body.workspaceId || '',
      preconfigId: body.preconfigId || null,
      title: body.title || 'New Session',
      status: 'active',
      metadata: body.metadata || null,
      parentId: null,
      agentName: null,
    });

    return c.json({ session }, 201);
  });

  // GET /api/sessions/grouped - List sessions grouped by workspace
  app.get('/api/sessions/grouped', async (c) => {
    const workspaceIdsParam = c.req.query('workspaceIds');
    if (!workspaceIdsParam) {
      return c.json({ error: 'Bad Request', message: 'workspaceIds query parameter is required' }, 400);
    }

    const workspaceIds = workspaceIdsParam.split(',').filter(Boolean);
    if (workspaceIds.length === 0) {
      return c.json({ error: 'Bad Request', message: 'At least one workspaceId is required' }, 400);
    }

    const status = c.req.query('status') as SessionStatus | undefined;
    const rootOnly = c.req.query('rootOnly') === 'true';

    const sessions = listSessionsGrouped(workspaceIds, { status, rootOnly });
    return c.json({ sessions });
  });

  // GET /api/sessions/:id - Get a session by ID
  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const session = getSession(id);

    if (!session) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    return c.json({ session });
  });

  // PUT /api/sessions/:id - Update a session
  app.put('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const session = updateSession(id, {
      title: body.title,
      status: body.status,
      metadata: body.metadata,
    });

    if (!session) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    return c.json({ session });
  });

  // DELETE /api/sessions/:id - Delete a session
  app.delete('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = deleteSession(id);

    if (!deleted) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    return c.json({ success: true });
  });

  // GET /api/sessions/:id/messages - Get messages for a session
  app.get('/api/sessions/:id/messages', async (c) => {
    const sessionId = c.req.param('id');

    // Verify session exists
    const session = getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    const messages = listMessages(sessionId);
    return c.json({ messages });
  });

  // GET /api/sessions/:id/attachments - List attachments for a session
  app.get('/api/sessions/:id/attachments', async (c) => {
    const sessionId = c.req.param('id');
    const session = getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    const attachments = getAttachmentsForSession(sessionId);
    return c.json({
      attachments: attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.sizeBytes,
        url: `/api/sessions/${sessionId}/attachments/${a.id}/content`,
      })),
    });
  });

  // POST /api/sessions/:id/attachments - Upload an attachment
  app.post('/api/sessions/:id/attachments', async (c) => {
    const sessionId = c.req.param('id');
    const session = getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Not Found', message: 'Session not found' }, 404);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Bad Request', message: 'No file provided. Use multipart/form-data with field name "file".' }, 400);
    }

    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size;

    if (sizeBytes > MAX_ATTACHMENT_SIZE) {
      return c.json({ error: 'Payload Too Large', message: `File size (${Math.round(sizeBytes / 1024 / 1024)} MB) exceeds the 20 MB limit.` }, 413);
    }

    const kind = determineKind(mimeType);

    if (kind === 'image' && !validateImageMime(mimeType)) {
      return c.json({ error: 'Bad Request', message: `Image type "${mimeType}" is not supported. Allowed: png, jpeg, webp, gif.` }, 400);
    }

    if (sizeBytes === 0) {
      return c.json({ error: 'Bad Request', message: 'File is empty.' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const attachment = createAttachment({
      sessionId,
      workspaceId: session.workspaceId,
      filename: file.name || 'unnamed',
      mimeType,
      sizeBytes,
      data: buffer,
    });

    return c.json({
      id: attachment.id,
      kind: attachment.kind,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.sizeBytes,
      url: `/api/sessions/${sessionId}/attachments/${attachment.id}/content?key=${attachment.accessKey}`,
    }, 201);
  });

  // GET /api/sessions/:id/attachments/:attachmentId/content - Get attachment content
  app.get('/api/sessions/:id/attachments/:attachmentId/content', async (c) => {
    const sessionId = c.req.param('id');
    const attachmentId = c.req.param('attachmentId');
    const accessKey = c.req.query('key');

    if (!accessKey) {
      return c.json({ error: 'Unauthorized', message: 'Missing access key' }, 401);
    }

    const attachment = getAttachmentByKey(attachmentId, accessKey);
    if (!attachment) {
      return c.json({ error: 'Not Found', message: 'Attachment not found' }, 404);
    }

    if (attachment.sessionId !== sessionId) {
      return c.json({ error: 'Forbidden', message: 'Session mismatch' }, 403);
    }

    if (!existsSync(attachment.absolutePath)) {
      return c.json({ error: 'Not Found', message: 'Attachment file not found on disk' }, 404);
    }

    const fileBuffer = readFileSync(attachment.absolutePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(attachment.sizeBytes),
        'Cache-Control': 'private, max-age=86400',
      },
    });
  });
}
