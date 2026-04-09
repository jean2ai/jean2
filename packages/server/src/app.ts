/**
 * Hono Application Setup
 *
 * Core application configuration for the AI Agent Server.
 * Includes REST API endpoints and WebSocket handler.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { mkdirSync, accessSync, constants, existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';

// Import types from shared
import type {
  SessionStatus,
} from '@jean2/sdk';

// Import store operations
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  listSessionsByWorkspace,
} from '@/store';
import {
  getAttachmentByKey,
  getAttachmentsForSession,
  createAttachment,
  determineKind,
  validateImageMime,
  MAX_ATTACHMENT_SIZE,
} from '@/store';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '@/store';
import {
  listMessages,
} from '@/store';

// Import configuration services
import * as providerCredentials from './configuration/provider-credentials';
import * as modelsConfig from './configuration/models';
import * as promptsConfig from './configuration/prompts';
import * as preconfigsConfig from './configuration/preconfigs';
import {
  ConfigurationNotFoundError,
  ConfigurationValidationError,
  ConfigurationConflictError,
  ConfigurationPersistenceError,
  ForbiddenDeleteError,
} from './configuration/errors';

// Import tool operations
import { listTools, getTool } from './tools';

// Import MCP operations
import * as mcp from './mcp';

// Import cleanup functions
import { cleanupSessionsOutputDirs } from '@/store';

// Import prompt operations
import { listPrompts, ensurePromptsDir } from './prompts/registry';

// Import file service
import { listDirectory, searchFiles, isPathWithinWorkspace } from './services/files';
import { getFilePreview } from './services/filePreview';

// Import auth modules
import { requireAuth, isPublicRoute } from './auth/middleware';
import { initializeToken } from './auth/token';

// Import provider operations
import * as providers from './providers';
import { VERSION } from './version';

// Helper function to expand ~ to user's home directory
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  return path;
}

export function createApp() {
  // Initialize authentication token
  initializeToken();

  // Ensure prompts directory exists
  ensurePromptsDir();
  
  const app = new Hono();

  // Middleware
  app.use('*', cors());
  app.use('*', logger());
  app.use('*', prettyJSON());

  // Authentication middleware for all API routes
  app.use('/api/*', async (c, next) => {
    // Skip auth for public routes
    if (isPublicRoute(c.req.path)) {
      return await next();
    }
    
    // Require auth for all other API routes
    return await requireAuth(c, next);
  });

  // ============================================================================
  // Root and Health Endpoints
  // ============================================================================

  app.get('/', (c) => {
    return c.json({
      status: 'ok',
      message: 'AI Agent Server is running',
      version: VERSION,
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================================
  // API Info Endpoints
  // ============================================================================

  // GET /api/info - Server information
  app.get('/api/info', (c) => {
    return c.json({
      name: 'AI Agent Server',
      version: VERSION,
      runtime: 'bun',
      features: {
        websocket: true,
        sessions: true,
        preconfigs: true,
        tools: true,
        authentication: true,
      },
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/health - Health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================================
  // Sessions API
  // ============================================================================

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

  // ============================================================================
  // Workspaces API
  // ============================================================================

  // GET /api/workspaces - List all workspaces
  app.get('/api/workspaces', async (c) => {
    let workspaces = listWorkspaces();

    // Auto-create default virtual workspace if none exist
    if (workspaces.length === 0) {
      const path = join(homedir(), '.jean2', 'workspaces', crypto.randomUUID());

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

    const { name, path: providedPath, isVirtual } = body;

    let path = providedPath;
    
    // Auto-generate path for virtual workspaces if not provided
    if (isVirtual && !path) {
      path = join(homedir(), '.jean2', 'workspaces', crypto.randomUUID());
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

    const workspace = createWorkspace({
      id: crypto.randomUUID(),
      name: name || 'New Workspace',
      path,
      isVirtual: isVirtual || false,
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

  // PATCH /api/workspaces/:id - Update a workspace (name only)
  app.patch('/api/workspaces/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const { name } = body;

    if (!name) {
      return c.json({ error: 'Bad Request', message: 'Name is required' }, 400);
    }

    const workspace = updateWorkspace(id, { name });

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
    const { getTerminalManager } = await import('./services/terminal');
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

  // ============================================================================
  // Terminal Sessions API
  // ============================================================================

  // GET /api/workspaces/:id/terminals - List active terminal sessions
  app.get('/api/workspaces/:id/terminals', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { getTerminalManager } = await import('./services/terminal');
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

    const { getTerminalManager } = await import('./services/terminal');
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

    const { getTerminalManager } = await import('./services/terminal');
    const session = getTerminalManager().getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Not Found', message: 'Terminal session not found' }, 404);
    }
    return c.json(session);
  });

  // DELETE /api/workspaces/:id/terminals/:sessionId - Kill and destroy a terminal session
  app.delete('/api/workspaces/:id/terminals/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');

    const { getTerminalManager } = await import('./services/terminal');
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

    const sessions = listSessionsByWorkspace(workspaceId);
    return c.json({ sessions });
  });

  // ============================================================================
  // Files API
  // ============================================================================

  app.get('/api/workspaces/:id/files', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path') || '';
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const showHidden = c.req.query('showHidden') !== 'false';

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
      if (search) {
        const files = await searchFiles(workspace.path, search, limit, showHidden, c.req.raw.signal);
        if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
        return c.json({ files, currentPath: '', mode: 'search' });
      }

      const fullPath = join(workspace.path, path);

      if (!isPathWithinWorkspace(fullPath, workspace.path)) {
        return c.json({ error: 'Forbidden', message: 'Path outside workspace' }, 403);
      }

      const files = await listDirectory(fullPath, showHidden);
      return c.json({ files, currentPath: path, mode: 'browse' });
    } catch (_err: unknown) {
      const _message = _err instanceof Error ? _err.message : 'Unknown error';
      return c.json({ error: 'Not Found', message: 'Path not found' }, 404);
    }
  });

  app.get('/api/workspaces/:id/file-preview', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path');

    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path query parameter is required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
      const preview = await getFilePreview(workspace.path, path);
      return c.json(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message === 'Cannot preview a directory') {
        return c.json({ error: 'Bad Request', message }, 400);
      }

      if (message === 'Path outside workspace') {
        return c.json({ error: 'Forbidden', message }, 403);
      }

      return c.json({ error: 'Not Found', message }, 404);
    }
  });

  app.get('/api/fs/browse', async (c) => {
    const path = c.req.query('path') || homedir();
    const resolvedPath = resolve(path.startsWith('~') ? expandPath(path) : path);
    const isRoot = resolvedPath === dirname(resolvedPath);

    try {
      const files = await listDirectory(resolvedPath);
      return c.json({ files, currentPath: resolvedPath, mode: 'browse', isRoot });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
  });

  app.get('/api/fs/parent', async (c) => {
    const inputPath = c.req.query('path') || homedir();
    const resolvedPath = resolve(inputPath);
    const parent = dirname(resolvedPath);
    const isRoot = resolvedPath === parent;

    try {
      const files = await listDirectory(parent);
      return c.json({ files, currentPath: resolve(parent), mode: 'browse', isRoot });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
  });

  app.get('/api/fs/drives', async (c) => {
    const platform = process.platform;

    if (platform === 'win32') {
      const drives: string[] = [];
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        try {
          accessSync(`${letter}:\\`, constants.R_OK);
          drives.push(`${letter}:\\`);
        } catch {
          // Drive not available, skip
        }
      }
      return c.json({ drives });
    }

    return c.json({ drives: ['/'] });
  });

  // ============================================================================
  // Messages API
  // ============================================================================

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

  // ============================================================================
  // Attachments API
  // ============================================================================

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

  // ============================================================================
  // Preconfigs API (validated)
  // ============================================================================

  app.get('/api/preconfigs', async (c) => {
    const preconfigs = await preconfigsConfig.listValidatedPreconfigs();
    return c.json({ preconfigs });
  });

  app.post('/api/preconfigs', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const format = body.format === 'md' ? 'md' : undefined;
      const preconfig = await preconfigsConfig.createValidatedPreconfig({
        id: body.id,
        name: body.name || 'Custom Preconfig',
        description: body.description || '',
        systemPrompt: body.systemPrompt || '',
        tools: body.tools ?? null,
        model: body.model ?? null,
        provider: body.provider ?? null,
        variant: body.variant ?? null,
        settings: body.settings ?? null,
        isDefault: false,
        mode: body.mode,
        canSpawnSubagents: body.canSpawnSubagents,
        skills: body.skills ?? null,
      }, format);
      return c.json({ preconfig }, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create preconfig', message }, 500);
    }
  });

  app.get('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const preconfig = await preconfigsConfig.listValidatedPreconfigs()
      .then(ps => ps.find(p => p.id === id));
    if (!preconfig) {
      return c.json({ error: 'Not Found', message: 'Preconfig not found' }, 404);
    }
    return c.json({ preconfig });
  });

  app.put('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    try {
      const preconfig = await preconfigsConfig.updateValidatedPreconfig(id, {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        tools: body.tools,
        model: body.model,
        provider: body.provider,
        variant: body.variant,
        settings: body.settings,
        isDefault: body.isDefault,
        mode: body.mode,
        canSpawnSubagents: body.canSpawnSubagents,
        skills: body.skills,
      });
      return c.json({ preconfig });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update preconfig', message }, 500);
    }
  });

  app.delete('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await preconfigsConfig.deleteValidatedPreconfig(id);
      return c.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ForbiddenDeleteError) {
        return c.json({ error: 'Forbidden', message: err.message }, 403);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete preconfig', message }, 500);
    }
  });

  // ============================================================================
  // Tools API
  // ============================================================================

  // GET /api/tools - List all available tools
  app.get('/api/tools', async (c) => {
    try {
      const tools = await listTools();
      return c.json({ tools });
    } catch (_error) {
      return c.json({ tools: [] });
    }
  });

  // GET /api/tools/:name - Get a specific tool by name
  app.get('/api/tools/:name', async (c) => {
    const name = c.req.param('name');
    
    try {
      const tool = await getTool(name);
      
      if (!tool) {
        return c.json({ error: 'Not Found', message: 'Tool not found' }, 404);
      }
      
      return c.json({ tool: tool.definition });
    } catch (_error) {
      return c.json({ error: 'Not Found', message: 'Tool not found' }, 404);
    }
  });

  // ============================================================================
  // MCP API
  // ============================================================================

  // GET /api/workspaces/:id/mcp/status - Get MCP server status for a workspace
  app.get('/api/workspaces/:id/mcp/status', async (c) => {
    const workspaceId = c.req.param('id');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
      const status = await mcp.getAllServerStatus(workspace.path);
      return c.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get MCP status', message }, 500);
    }
  });

  // POST /api/workspaces/:id/mcp/connect - Connect to an MCP server
  app.post('/api/workspaces/:id/mcp/connect', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { name } = body;
    if (!name) {
      return c.json({ error: 'Bad Request', message: 'Server name is required' }, 400);
    }

    try {
      const config = await mcp.getMcpServers(workspace.path);
      const serverConfig = config[name];

      if (!serverConfig) {
        return c.json({ error: 'Not Found', message: 'MCP server not found in config' }, 404);
      }

      const status = await mcp.connectServer(workspace.path, name, serverConfig);
      return c.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to connect', message }, 500);
    }
  });

  // POST /api/workspaces/:id/mcp/disconnect - Disconnect from an MCP server
  app.post('/api/workspaces/:id/mcp/disconnect', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { name } = body;
    if (!name) {
      return c.json({ error: 'Bad Request', message: 'Server name is required' }, 400);
    }

    try {
      await mcp.disconnectServer(workspace.path, name);
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to disconnect', message }, 500);
    }
  });

  // POST /api/workspaces/:id/mcp/auth - Start OAuth flow for a server
  app.post('/api/workspaces/:id/mcp/auth', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { name } = body;
    if (!name) {
      return c.json({ error: 'Bad Request', message: 'Server name is required' }, 400);
    }

    try {
      const result = await mcp.startAuth(workspace.path, name);
      return c.json({ authorizationUrl: result.authorizationUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to start auth', message }, 500);
    }
  });

  // POST /api/workspaces/:id/mcp/auth/callback - Handle OAuth callback
  app.post('/api/workspaces/:id/mcp/auth/callback', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { name, code } = body;
    if (!name || !code) {
      return c.json({ error: 'Bad Request', message: 'Server name and code are required' }, 400);
    }

    try {
      const status = await mcp.finishAuth(workspace.path, name, code);
      return c.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to complete auth', message }, 500);
    }
  });

  // ============================================================================
  // Prompts API
  // ============================================================================

  app.get('/api/prompts', async (c) => {
    try {
      const prompts = await listPrompts();
      return c.json({ prompts });
    } catch (_error) {
      return c.json({ prompts: [] });
    }
  });

  // ============================================================================
  // Models API
  // ============================================================================

  // GET /api/models - List all available models
  app.get('/api/models', async (c) => {
    try {
      const configResponse = modelsConfig.getModelsConfigWithStatus();
      const models = configResponse.providers.flatMap((provider) => provider.models);
      return c.json({
        models,
        defaultModel: configResponse.defaultModel,
        defaultProvider: configResponse.defaultProvider,
      });
    } catch (_error) {
      return c.json({ models: [], error: 'Failed to load models' });
    }
  });

  // ============================================================================
  // Providers API
  // ============================================================================

  // GET /api/providers - List all connectable providers with status and metadata
  app.get('/api/providers', async (c) => {
    try {
      const allProviders = providers.getConnectableProviders();
      const providerStatuses = allProviders.map(p => ({
        ...p.descriptor,
        ...p.getStatus(),
      }));
      return c.json({ providers: providerStatuses });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get providers', message }, 500);
    }
  });

  // POST /api/providers/:providerId/connect - Start connection flow
  app.post('/api/providers/:providerId/connect', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const result = await providers.connectProvider(providerId);
      const status = await providers.getProviderStatus(providerId);
      return c.json({ authorizationUrl: result.authorizationUrl, status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to start connection', message }, 500);
    }
  });

  // GET /api/providers/:providerId/status - Get provider connection status
  app.get('/api/providers/:providerId/status', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const status = await providers.getProviderStatus(providerId);
      return c.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get status', message }, 500);
    }
  });

  // DELETE /api/providers/:providerId - Disconnect provider
  app.delete('/api/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      await providers.disconnectProvider(providerId);
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to disconnect', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Provider Credentials
  // ============================================================================

  app.get('/api/config/providers', (c) => {
    try {
      const result = providerCredentials.listProviderCredentials();
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list provider credentials', message }, 500);
    }
  });

  app.put('/api/config/providers/:provider', async (c) => {
    const provider = c.req.param('provider');
    const body = await c.req.json().catch(() => ({}));
    const { apiKey } = body;
    try {
      const result = await providerCredentials.setProviderCredential(provider, apiKey);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationPersistenceError) {
        return c.json({ error: 'Internal Server Error', message: err.message }, 500);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to set provider credential', message }, 500);
    }
  });

  app.delete('/api/config/providers/:provider', async (c) => {
    const provider = c.req.param('provider');
    try {
      const result = await providerCredentials.clearProviderCredential(provider);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationPersistenceError) {
        return c.json({ error: 'Internal Server Error', message: err.message }, 500);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to clear provider credential', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Models
  // ============================================================================

  app.get('/api/config/models', (c) => {
    try {
      const result = modelsConfig.getModelsConfigWithStatus();
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to load models configuration', message }, 500);
    }
  });

  app.post('/api/config/models/providers', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.createProvider(body);
      return c.json(result, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create provider', message }, 500);
    }
  });

  app.put('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.updateProvider(providerId, body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update provider', message }, 500);
    }
  });

  app.delete('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const result = await modelsConfig.deleteProvider(providerId);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete provider', message }, 500);
    }
  });

  app.post('/api/config/models/providers/:providerId/models', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.createModel(providerId, body);
      return c.json(result, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create model', message }, 500);
    }
  });

  app.put('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.updateModel(providerId, modelId, body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update model', message }, 500);
    }
  });

  app.delete('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    try {
      const result = await modelsConfig.deleteModel(providerId, modelId);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete model', message }, 500);
    }
  });

  app.put('/api/config/models/defaults', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.setDefaults(body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to set defaults', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Prompts
  // ============================================================================

  app.get('/api/config/prompts', async (c) => {
    try {
      const prompts = await promptsConfig.listPromptConfigs();
      return c.json({ prompts });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list prompts', message }, 500);
    }
  });

  app.get('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    try {
      const prompt = await promptsConfig.getPromptConfig(name);
      return c.json(prompt);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get prompt', message }, 500);
    }
  });

  app.post('/api/config/prompts', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const prompt = await promptsConfig.createPromptConfig(body);
      return c.json(prompt, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create prompt', message }, 500);
    }
  });

  app.put('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    try {
      const prompt = await promptsConfig.updatePromptConfig(name, body);
      return c.json(prompt);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update prompt', message }, 500);
    }
  });

  app.delete('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    try {
      await promptsConfig.deletePromptConfig(name);
      return c.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete prompt', message }, 500);
    }
  });

  // ============================================================================
  // WebSocket Handler
  // ============================================================================

  // WebSocket endpoint: GET /ws
  app.get('/ws', async (c) => {
    if (!c.req.raw.headers.get('upgrade')?.toLowerCase()) {
      return c.json({ error: 'Bad Request', message: 'Expected WebSocket upgrade' }, 400);
    }
    
    const sessionId = c.req.query('sessionId');
    
    return c.json({
      message: 'WebSocket endpoint - requires WebSocket upgrade support',
      protocol: 'ai-agent-ws',
      version: VERSION,
      sessionId
    });
  });

  // ============================================================================
  // 404 and Error Handlers
  // ============================================================================

  app.notFound((c) => {
    return c.json(
      {
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: c.req.path,
        method: c.req.method
      },
      404
    );
  });

  app.onError((err, c) => {
    console.log('\n');
    console.log('========== ERROR ==========');
    console.log('Message:', err.message);
    console.log('Path:', c.req.path);
    console.log('Method:', c.req.method);
    console.log('Stack:', err.stack);
    console.log('============================\n');
    
    return c.json(
      {
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        path: c.req.path,
        method: c.req.method
      },
      500
    );
  });

  return app;
}

export default createApp;
