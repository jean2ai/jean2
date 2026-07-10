import type { Hono } from 'hono';
import { validate } from './validate';
import type { SessionStatus } from '@jean2/sdk';
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  listMessages,
  listSessionsGrouped,
  listSessionPageGrouped,
  listTagsByWorkspace,
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
import { markManualSessionTitle } from '@/core/session-title';
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError, PayloadTooLargeError } from '@/utils/http-errors';
import { createSessionSchema, updateSessionSchema } from './schemas';

export function registerSessionRoutes(app: Hono): void {
  app.get('/api/sessions', async (c) => {
    const status = c.req.query('status') as SessionStatus | undefined;
    const sessions = listSessions(status);
    return c.json({ sessions });
  });

  app.post(
    '/api/sessions',
    validate('json', createSessionSchema),
    async (c) => {
      const body = c.req.valid('json');
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
    },
  );

  app.get('/api/sessions/grouped', async (c) => {
    const workspaceIdsParam = c.req.query('workspaceIds');
    if (!workspaceIdsParam) {
      throw new BadRequestError('workspaceIds query parameter is required');
    }

    const workspaceIds = workspaceIdsParam.split(',').filter(Boolean);
    if (workspaceIds.length === 0) {
      throw new BadRequestError('At least one workspaceId is required');
    }

    const status = c.req.query('status') as SessionStatus | undefined;
    const rootOnly = c.req.query('rootOnly') === 'true';
    const limitPerWorkspaceParam = c.req.query('limitPerWorkspace');

    // When limitPerWorkspace is present, use bounded grouped pagination
    if (limitPerWorkspaceParam !== undefined) {
      const limitPerWorkspace = parseInt(limitPerWorkspaceParam, 10);
      if (isNaN(limitPerWorkspace) || limitPerWorkspace < 1 || limitPerWorkspace > 100) {
        throw new BadRequestError('limitPerWorkspace must be an integer between 1 and 100');
      }

      const result = listSessionPageGrouped(workspaceIds, { status, rootOnly, limitPerWorkspace });
      return c.json({ sessions: result.sessions, pagination: result.pagination });
    }

    const sessions = listSessionsGrouped(workspaceIds, { status, rootOnly });
    return c.json({ sessions });
  });

  app.get('/api/sessions/tags', async (c) => {
    const workspaceId = c.req.query('workspaceId');
    if (!workspaceId) {
      throw new BadRequestError('workspaceId query parameter is required');
    }
    const tags = listTagsByWorkspace(workspaceId);
    return c.json({ tags });
  });

  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const session = getSession(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return c.json({ session });
  });

  app.put(
    '/api/sessions/:id',
    validate('json', updateSessionSchema),
    async (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');
      const existing = getSession(id);
      const session = updateSession(id, {
        title: body.title,
        status: body.status,
        metadata: body.title !== undefined
          ? markManualSessionTitle(body.metadata ?? existing?.metadata)
          : body.metadata,
        tags: body.tags,
        autoApproveSeverity: body.autoApproveSeverity,
      });
      if (!session) {
        throw new NotFoundError('Session not found');
      }
      return c.json({ session });
    },
  );

  app.delete('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = deleteSession(id);
    if (!deleted) {
      throw new NotFoundError('Session not found');
    }
    return c.json({ success: true });
  });

  app.get('/api/sessions/:id/messages', async (c) => {
    const sessionId = c.req.param('id');
    const session = getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    const messages = listMessages(sessionId);
    return c.json({ messages });
  });

  app.get('/api/sessions/:id/attachments', async (c) => {
    const sessionId = c.req.param('id');
    const session = getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
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

  app.post('/api/sessions/:id/attachments', async (c) => {
    const sessionId = c.req.param('id');
    const session = getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new BadRequestError('No file provided. Use multipart/form-data with field name "file".');
    }

    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size;

    if (sizeBytes > MAX_ATTACHMENT_SIZE) {
      throw new PayloadTooLargeError(`File size (${Math.round(sizeBytes / 1024 / 1024)} MB) exceeds the 20 MB limit.`);
    }

    const kind = determineKind(mimeType);
    if (kind === 'image' && !validateImageMime(mimeType)) {
      throw new BadRequestError(`Image type "${mimeType}" is not supported. Allowed: png, jpeg, webp, gif.`);
    }

    if (sizeBytes === 0) {
      throw new BadRequestError('File is empty.');
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

  app.get('/api/sessions/:id/attachments/:attachmentId/content', async (c) => {
    const sessionId = c.req.param('id');
    const attachmentId = c.req.param('attachmentId');
    const accessKey = c.req.query('key');

    if (!accessKey) {
      throw new UnauthorizedError('Missing access key');
    }

    const attachment = getAttachmentByKey(attachmentId, accessKey);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    if (attachment.sessionId !== sessionId) {
      throw new ForbiddenError('Session mismatch');
    }

    if (!existsSync(attachment.absolutePath)) {
      throw new NotFoundError('Attachment file not found on disk');
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
