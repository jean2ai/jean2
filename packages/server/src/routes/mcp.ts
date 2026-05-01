import type { Hono } from 'hono';
import { getWorkspace } from '@/store';
import * as mcp from '@/mcp';

export function registerMcpRoutes(app: Hono): void {
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
}
