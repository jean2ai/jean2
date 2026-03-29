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
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

// Import types from shared
import type {
  SessionStatus,
} from '@jean2/shared';

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
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '@/store';
import {
  listMessages,
} from '@/store';

// Import preconfig operations
import {
  listPreconfigs,
  getPreconfig,
  createPreconfig,
  updatePreconfig,
  deletePreconfig,
} from './core/preconfig';

// Import tool operations
import { listTools, getTool } from './tools';

// Import MCP operations
import * as mcp from './mcp';

// Import prompt operations
import { listPrompts, ensurePromptsDir } from './prompts/registry';

// Import config functions
import { getModelsConfig, getAllModels } from './config';

// Import file service
import { listDirectory, searchFiles, isPathWithinWorkspace } from './services/files';

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

    // Import getTerminalManager dynamically to avoid circular dependency
    const { getTerminalManager } = await import('./services/terminal');
    getTerminalManager().destroySessionsForWorkspace(workspace.path);

    const deleted = deleteWorkspace(id);

    if (!deleted) {
      return c.json({ error: 'Internal Server Error', message: 'Failed to delete workspace' }, 500);
    }

    return c.json({ success: true });
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

  app.get('/api/fs/browse', async (c) => {
    const path = c.req.query('path') || homedir();

    try {
      const files = await listDirectory(path);
      return c.json({ files, currentPath: path, mode: 'browse' });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
  });

  app.get('/api/fs/parent', async (c) => {
    const path = c.req.query('path') || homedir();
    const parent = dirname(path);

    try {
      const files = await listDirectory(parent);
      return c.json({ files, currentPath: parent, mode: 'browse' });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
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
  // Preconfigs API
  // ============================================================================

  // GET /api/preconfigs - List all preconfigs
  app.get('/api/preconfigs', async (c) => {
    const preconfigs = await listPreconfigs();
    return c.json({ preconfigs });
  });

  // POST /api/preconfigs - Create a new preconfig
  app.post('/api/preconfigs', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    
    const format = body.format === 'md' ? 'md' : undefined;
    
    const preconfig = await createPreconfig({
      name: body.name || 'Custom Preconfig',
      description: body.description || '',
      systemPrompt: body.systemPrompt || '',
      tools: body.tools || null,
      model: body.model || null,
      provider: body.provider || null,
      settings: body.settings || null,
      isDefault: false,
    }, format);
    
    return c.json({ preconfig }, 201);
  });

  // GET /api/preconfigs/:id - Get a preconfig by ID
  app.get('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const preconfig = await getPreconfig(id);
    
    if (!preconfig) {
      return c.json({ error: 'Not Found', message: 'Preconfig not found' }, 404);
    }
    
    return c.json({ preconfig });
  });

  // PUT /api/preconfigs/:id - Update a preconfig
  app.put('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    
    const preconfig = await updatePreconfig(id, {
      name: body.name,
      description: body.description,
      systemPrompt: body.systemPrompt,
      tools: body.tools,
      model: body.model,
      provider: body.provider,
      settings: body.settings,
      isDefault: body.isDefault,
    });
    
    if (!preconfig) {
      return c.json({ error: 'Not Found', message: 'Preconfig not found' }, 404);
    }
    
    return c.json({ preconfig });
  });

  // DELETE /api/preconfigs/:id - Delete a preconfig
  app.delete('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    
    // Check if preconfig exists
    const preconfig = await getPreconfig(id);
    if (!preconfig) {
      return c.json({ error: 'Not Found', message: 'Preconfig not found' }, 404);
    }
    
    // Prevent deleting default preconfigs
    if (preconfig.isDefault) {
      return c.json({ error: 'Forbidden', message: 'Cannot delete default preconfig' }, 403);
    }
    
    const deleted = await deletePreconfig(id);
    
    if (!deleted) {
      return c.json({ error: 'Internal Server Error', message: 'Failed to delete preconfig' }, 500);
    }
    
    return c.json({ success: true });
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
      const models = getAllModels();
      const config = getModelsConfig();
      return c.json({ 
        models,
        defaultModel: config.defaultModel,
        defaultProvider: config.defaultProvider,
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
