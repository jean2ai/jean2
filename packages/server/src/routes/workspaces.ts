import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { SessionStatus } from '@jean2/sdk';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listSessionsByWorkspace,
  cleanupSessionsOutputDirs,
  listPinnedMessagesByWorkspace,
  pinMessage,
  deleteScheduledJobsByWorkspace,
  unpinMessage,
} from '@/store';
import { getWorkspacesDir } from '@/paths';
import { getTerminalManager } from '@/services/terminal';
import * as mcp from '@/mcp';
import { NotFoundError, BadRequestError } from '@/utils/http-errors';
import { expandPath } from '@/utils/paths';
import { createWorkspaceSchema, updateWorkspaceSettingsSchema, pinMessageSchema } from './schemas';

export function registerWorkspaceRoutes(app: Hono): void {
  // GET /api/workspaces - List all workspaces
  app.get('/api/workspaces', async (c) => {
    let workspaces = listWorkspaces();

    // Auto-create default virtual workspace if none exist
    if (workspaces.length === 0) {
      const path = join(getWorkspacesDir(), crypto.randomUUID());

      // Create directory if it doesn't exist
      try {
        mkdirSync(path, { recursive: true });
      } catch (err) {
        console.error('Failed to create workspace directory:', err);
        return c.json({ error: 'Internal Server Error', message: 'Failed to create workspace directory' }, 500);
      }

      const defaultWorkspace = createWorkspace({
        id: crypto.randomUUID(),
        name: 'Virtual Workspace',
        path,
        isVirtual: true,
      });

      workspaces = [defaultWorkspace];
    }

    return c.json({ workspaces });
  });

  // POST /api/workspaces - Create a new workspace
  app.post(
    '/api/workspaces',
    zValidator('json', createWorkspaceSchema),
    async (c) => {
      const body = c.req.valid('json');
      const { name, path: providedPath, isVirtual, additionalPaths } = body;

      let path = providedPath;

      // Auto-generate path for virtual workspaces if not provided
      if (isVirtual && !path) {
        path = join(getWorkspacesDir(), crypto.randomUUID());
      }

      // Only reject if still no path (non-virtual workspaces require a path)
      if (!path) {
        throw new BadRequestError('Path is required for physical workspaces');
      }

      // Create directory if it doesn't exist
      try {
        const expandedPath = expandPath(path);
        mkdirSync(expandedPath, { recursive: true });
        path = expandedPath;
      } catch (err) {
        console.error('Failed to create workspace directory:', err);
        throw new BadRequestError('Failed to create workspace directory');
      }

      // Validate additional paths (must exist on disk)
      const validatedPaths: string[] = [];
      if (Array.isArray(additionalPaths)) {
        for (const p of additionalPaths) {
          const expanded = expandPath(p);
          if (existsSync(expanded)) {
            validatedPaths.push(expanded);
          }
        }
      }

      const workspace = createWorkspace({
        id: crypto.randomUUID(),
        name: name || 'New Workspace',
        path,
        isVirtual: isVirtual || false,
        additionalPaths: validatedPaths,
      });

      return c.json({ workspace }, 201);
    },
  );

  app.get('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const workspace = getWorkspace(id);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    return c.json({ workspace });
  });

  // PATCH /api/workspaces/:id - Update a workspace (name, additionalPaths, settings)
  app.patch(
    '/api/workspaces/:id',
    zValidator('json', updateWorkspaceSettingsSchema),
    async (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');

      const { name, additionalPaths, settings } = body;

      if (!name && additionalPaths === undefined && settings === undefined) {
        throw new BadRequestError('Name, additionalPaths, or settings is required');
      }

      // Validate additional paths
      let validatedPaths: string[] | undefined;
      if (Array.isArray(additionalPaths)) {
        validatedPaths = additionalPaths
          .map((p: string) => expandPath(p))
          .filter((p: string) => existsSync(p));
      }

      const workspace = updateWorkspace(id, {
        name,
        additionalPaths: validatedPaths,
        settings: settings as import('@jean2/sdk').WorkspaceSettings | undefined,
      });
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      return c.json({ workspace });
    },
  );

  // DELETE /api/workspaces/:id - Delete a workspace
  app.delete('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');

    const workspace = getWorkspace(id);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // 1. Gather all session IDs for the workspace before deleting
    const sessions = listSessionsByWorkspace(id);
    const sessionIds = sessions.map(s => s.id);

    // 2. Shutdown MCP workspace runtime state for that workspace
    try {
      await mcp.shutdownWorkspace(workspace.path);
    } catch (err) {
      console.warn(`[workspace cleanup] Failed to shutdown MCP workspace ${workspace.path}:`, err);
    }

    // 3. Destroy terminal sessions for that workspace
    getTerminalManager().destroySessionsForWorkspace(workspace.path);

    // 4. Delete scheduled jobs for that workspace
    deleteScheduledJobsByWorkspace(id);

    // 5. Delete the workspace DB row (cascades to sessions, messages, etc.)
    const deleted = deleteWorkspace(id);
    if (!deleted) {
      throw new NotFoundError('Workspace not found');
    }

    // 6. Delete session-related temp/output directories for the workspace's sessions
    // Use pre-collected session IDs since the DB cascade delete has already removed the sessions
    cleanupSessionsOutputDirs(sessionIds);

    return c.json({ success: true, deletedSessions: sessionIds });
  });

  // GET /api/workspaces/:id/terminals - List active terminal sessions
  app.get('/api/workspaces/:id/terminals', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const sessions = getTerminalManager().listSessionsForWorkspace(workspace.path);
    return c.json({ sessions });
  });

  // POST /api/workspaces/:id/terminals - Create a new terminal session
  app.post('/api/workspaces/:id/terminals', async (c) => {
    const workspaceId = c.req.param('id');
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const sessionId = getTerminalManager().createSessionDetached({
      cwd: workspace.path,
      workspaceId,
    });

    if (!sessionId) {
      return c.json({ error: 'Limit Reached', message: 'Maximum terminal sessions reached for this workspace' }, 429);
    }

    const session = getTerminalManager().getSession(sessionId);
    return c.json({ session });
  });

  // GET /api/workspaces/:id/terminals/:sessionId - Get single session info
  app.get('/api/workspaces/:id/terminals/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');

    const session = getTerminalManager().getSession(sessionId);
    if (!session) {
      throw new NotFoundError('Terminal session not found');
    }
    return c.json(session);
  });

  // DELETE /api/workspaces/:id/terminals/:sessionId - Kill and destroy a terminal session
  app.delete('/api/workspaces/:id/terminals/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');

    getTerminalManager().destroySessionById(sessionId);
    return c.json({ success: true });
  });

  // GET /api/workspaces/:id/sessions - List sessions in a workspace
  app.get('/api/workspaces/:id/sessions', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const status = c.req.query('status') as SessionStatus | undefined;
    const rootOnly = c.req.query('rootOnly') === 'true';
    const sessions = listSessionsByWorkspace(workspaceId, { status, rootOnly });
    return c.json({ sessions });
  });

  // GET /api/workspaces/:id/pinned-messages - List pinned messages for a workspace
  app.get('/api/workspaces/:id/pinned-messages', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const pinnedMessages = listPinnedMessagesByWorkspace(workspaceId);
    return c.json({ pinnedMessages });
  });

  // POST /api/workspaces/:id/pinned-messages - Pin a message
  app.post(
    '/api/workspaces/:id/pinned-messages',
    zValidator('json', pinMessageSchema),
    async (c) => {
      const workspaceId = c.req.param('id');
      const { sessionId, messageId } = c.req.valid('json');

      const pinnedMessage = pinMessage({ workspaceId, sessionId, messageId });
      return c.json({ pinnedMessage }, 201);
    },
  );

  // DELETE /api/workspaces/:id/pinned-messages/:messageId - Unpin a message
  app.delete('/api/workspaces/:id/pinned-messages/:messageId', async (c) => {
    const workspaceId = c.req.param('id');
    const messageId = c.req.param('messageId');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    unpinMessage(workspaceId, messageId);
    return c.json({ success: true });
  });
}
