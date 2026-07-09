import type { Hono } from 'hono';
import { getWorkspace } from '@/store';
import * as mcp from '@/mcp';
import { NotFoundError, BadRequestError } from '@/utils/http-errors';

export function registerMcpRoutes(app: Hono): void {
  app.get('/api/workspaces/:id/mcp/status', async (c) => {
    const workspaceId = c.req.param('id');
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const status = await mcp.getAllServerStatus(workspace.path);
    return c.json({ status });
  });

  app.post('/api/workspaces/:id/mcp/connect', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const { name } = body;
    if (!name) {
      throw new BadRequestError('Server name is required');
    }

    const config = await mcp.getMcpServers(workspace.path);
    const serverConfig = config[name];
    if (!serverConfig) {
      throw new NotFoundError('MCP server not found in config');
    }

    const status = await mcp.connectServer(workspace.path, name, serverConfig);
    return c.json({ status });
  });

  app.post('/api/workspaces/:id/mcp/disconnect', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const { name } = body;
    if (!name) {
      throw new BadRequestError('Server name is required');
    }

    await mcp.disconnectServer(workspace.path, name);
    return c.json({ success: true });
  });

  app.post('/api/workspaces/:id/mcp/auth', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const { name } = body;
    if (!name) {
      throw new BadRequestError('Server name is required');
    }

    const result = await mcp.startAuth(workspace.path, name);
    return c.json({ authorizationUrl: result.authorizationUrl });
  });

  app.post('/api/workspaces/:id/mcp/auth/callback', async (c) => {
    const workspaceId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const { name, code } = body;
    if (!name || !code) {
      throw new BadRequestError('Server name and code are required');
    }

    const status = await mcp.finishAuth(workspace.path, name, code);
    return c.json({ status });
  });
}
