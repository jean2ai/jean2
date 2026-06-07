import type { Hono } from 'hono';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SessionStatus, WorkspaceSettings, PermissionRiskLevel } from '@jean2/sdk';
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
  unpinMessage,
  PinnedMessageError,
} from '@/store';
import { getWorkspacesDir } from '@/paths';
import { getTerminalManager } from '@/services/terminal';
import * as mcp from '@/mcp';

function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  return path;
}

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
  app.post('/api/workspaces', async (c) => {
    const body = await c.req.json().catch(() => ({}));

    const { name, path: providedPath, isVirtual, additionalPaths } = body;

    let path = providedPath;

    // Auto-generate path for virtual workspaces if not provided
    if (isVirtual && !path) {
      path = join(getWorkspacesDir(), crypto.randomUUID());
    }

    // Only reject if still no path (non-virtual workspaces require a path)
    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path is required for physical workspaces' }, 400);
    }

    // Create directory if it doesn't exist
    try {
      const expandedPath = expandPath(path);
      mkdirSync(expandedPath, { recursive: true });
      path = expandedPath; // Update to use expanded path
    } catch (err) {
      console.error('Failed to create workspace directory:', err);
      return c.json({ error: 'Internal Server Error', message: 'Failed to create workspace directory' }, 500);
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
  });

  // GET /api/workspaces/:id - Get a workspace by ID
  app.get('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const workspace = getWorkspace(id);

    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    return c.json({ workspace });
  });

  // PATCH /api/workspaces/:id - Update a workspace (name, additionalPaths, settings)
  app.patch('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const { name, additionalPaths, settings } = body;

    if (!name && additionalPaths === undefined && settings === undefined) {
      return c.json({ error: 'Bad Request', message: 'Name, additionalPaths, or settings is required' }, 400);
    }

    // Validate settings shape if provided
    if (settings !== undefined) {
      if (typeof settings !== 'object' || settings === null) {
        return c.json({ error: 'Bad Request', message: 'Settings must be an object' }, 400);
      }
      if (settings.memory !== undefined) {
        if (typeof settings.memory !== 'object' || settings.memory === null) {
          return c.json({ error: 'Bad Request', message: 'Memory settings must be an object' }, 400);
        }
        if (typeof settings.memory.enabled !== 'boolean') {
          return c.json({ error: 'Bad Request', message: 'memory.enabled must be a boolean' }, 400);
        }
        const validRisks: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
        if (!validRisks.includes(settings.memory.permissionRisk)) {
          return c.json({ error: 'Bad Request', message: 'memory.permissionRisk must be a valid risk level' }, 400);
        }
      }
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
      settings: settings as WorkspaceSettings | undefined,
    });

    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    return c.json({ workspace });
  });

  // DELETE /api/workspaces/:id - Delete a workspace
  app.delete('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');

    // Check if workspace exists
    const workspace = getWorkspace(id);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
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

    // 4. Delete the workspace DB row (cascades to sessions, messages, etc.)
    const deleted = deleteWorkspace(id);

    if (!deleted) {
      return c.json({ error: 'Internal Server Error', message: 'Failed to delete workspace' }, 500);
    }

    // 5. Delete session-related temp/output directories for the workspace's sessions
    // Use pre-collected session IDs since the DB cascade delete has already removed the sessions
    cleanupSessionsOutputDirs(sessionIds);

    return c.json({ success: true, deletedSessions: sessionIds });
  });

  // GET /api/workspaces/:id/terminals - List active terminal sessions
  app.get('/api/workspaces/:id/terminals', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const sessions = getTerminalManager().listSessionsForWorkspace(workspace.path);
    return c.json({ sessions });
  });

  // POST /api/workspaces/:id/terminals - Create a new terminal session
  app.post('/api/workspaces/:id/terminals', async (c) => {
    const workspaceId = c.req.param('id');
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
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
      return c.json({ error: 'Not Found', message: 'Terminal session not found' }, 404);
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

    // Verify workspace exists
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
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
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const pinnedMessages = listPinnedMessagesByWorkspace(workspaceId);
    return c.json({ pinnedMessages });
  });

  // POST /api/workspaces/:id/pinned-messages - Pin a message
  app.post('/api/workspaces/:id/pinned-messages', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const { sessionId, messageId } = body;
    if (!sessionId || !messageId) {
      return c.json({ error: 'Bad Request', message: 'sessionId and messageId are required' }, 400);
    }

    try {
      const pinnedMessage = pinMessage({ workspaceId, sessionId, messageId });
      return c.json({ pinnedMessage }, 201);
    } catch (err) {
      if (err instanceof PinnedMessageError) {
        if (err.code === 'message_not_assistant') {
          return c.json({ error: 'Unprocessable Entity', message: err.message }, 422);
        }
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      throw err;
    }
  });

  // DELETE /api/workspaces/:id/pinned-messages/:messageId - Unpin a message
  app.delete('/api/workspaces/:id/pinned-messages/:messageId', async (c) => {
    const workspaceId = c.req.param('id');
    const messageId = c.req.param('messageId');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    unpinMessage(workspaceId, messageId);
    return c.json({ success: true });
  });
}
