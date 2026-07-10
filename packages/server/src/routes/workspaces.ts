import type { Hono } from 'hono';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import type { SessionStatus, WorkspaceSettings, PermissionRiskLevel, AutoApproveSeverity } from '@jean2/sdk';
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

  app.get('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const workspace = getWorkspace(id);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    return c.json({ workspace });
  });

  // PATCH /api/workspaces/:id - Update a workspace (name, additionalPaths, settings)
  app.patch('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const { name, additionalPaths, settings } = body;

    if (!name && additionalPaths === undefined && settings === undefined) {
      throw new BadRequestError('Name, additionalPaths, or settings is required');
    }

    if (settings !== undefined) {
      if (typeof settings !== 'object' || settings === null) {
        throw new BadRequestError('Settings must be an object');
      }
      if (settings.memory !== undefined) {
        if (typeof settings.memory !== 'object' || settings.memory === null) {
          throw new BadRequestError('Memory settings must be an object');
        }
        if (typeof settings.memory.enabled !== 'boolean') {
          throw new BadRequestError('memory.enabled must be a boolean');
        }
        const validRisks: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
        if (!validRisks.includes(settings.memory.permissionRisk)) {
          throw new BadRequestError('memory.permissionRisk must be a valid risk level');
        }
      }
      if (settings.skills !== undefined) {
        if (typeof settings.skills !== 'object' || settings.skills === null) {
          throw new BadRequestError('Skills settings must be an object');
        }
        if (typeof settings.skills.managementEnabled !== 'boolean') {
          throw new BadRequestError('skills.managementEnabled must be a boolean');
        }
        const validRisks: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
        if (!validRisks.includes(settings.skills.permissionRisk)) {
          throw new BadRequestError('skills.permissionRisk must be a valid risk level');
        }
      }
      if (settings.sessionSearch !== undefined) {
        if (typeof settings.sessionSearch !== 'object' || settings.sessionSearch === null) {
          throw new BadRequestError('Session search settings must be an object');
        }
        if (typeof settings.sessionSearch.enabled !== 'boolean') {
          throw new BadRequestError('sessionSearch.enabled must be a boolean');
        }
        const validRisks: PermissionRiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
        if (!validRisks.includes(settings.sessionSearch.permissionRisk)) {
          throw new BadRequestError('sessionSearch.permissionRisk must be a valid risk level');
        }
        if (typeof settings.sessionSearch.includeToolResults !== 'boolean') {
          throw new BadRequestError('sessionSearch.includeToolResults must be a boolean');
        }
      }
      if (settings.autoApproveSeverity !== undefined && settings.autoApproveSeverity !== null) {
        const validSeverities: AutoApproveSeverity[] = ['off', 'none', 'low', 'medium', 'high'];
        if (!validSeverities.includes(settings.autoApproveSeverity)) {
          throw new BadRequestError('autoApproveSeverity must be a valid severity level');
        }
      }
      if (settings.preconfigs !== undefined && settings.preconfigs !== null) {
        if (typeof settings.preconfigs !== 'object' || settings.preconfigs === null) {
          throw new BadRequestError('preconfigs settings must be an object');
        }
        if (settings.preconfigs.selectedIds !== undefined && settings.preconfigs.selectedIds !== null) {
          if (!Array.isArray(settings.preconfigs.selectedIds) || !settings.preconfigs.selectedIds.every((id: unknown) => typeof id === 'string')) {
            throw new BadRequestError('preconfigs.selectedIds must be an array of strings or null');
          }
        }
        if (settings.preconfigs.defaultId !== undefined && settings.preconfigs.defaultId !== null) {
          if (typeof settings.preconfigs.defaultId !== 'string') {
            throw new BadRequestError('preconfigs.defaultId must be a string or null');
          }
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
      throw new NotFoundError('Workspace not found');
    }
    return c.json({ workspace });
  });

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
  app.post('/api/workspaces/:id/pinned-messages', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const { sessionId, messageId } = body;
    if (!sessionId || !messageId) {
      throw new BadRequestError('sessionId and messageId are required');
    }

    const pinnedMessage = pinMessage({ workspaceId, sessionId, messageId });
    return c.json({ pinnedMessage }, 201);
  });

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
