import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getWorkspace } from '@/store';
import * as mcp from '@/mcp';
import { NotFoundError } from '@/utils/http-errors';
import { mcpServerNameSchema } from './schemas';

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

  app.post(
    '/api/workspaces/:id/mcp/connect',
    zValidator('json', mcpServerNameSchema),
    async (c) => {
      const workspaceId = c.req.param('id');
      const { name } = c.req.valid('json');
      const workspace = getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const config = await mcp.getMcpServers(workspace.path);
      const serverConfig = config[name];
      if (!serverConfig) {
        throw new NotFoundError('MCP server not found in config');
      }

      const status = await mcp.connectServer(workspace.path, name, serverConfig);
      return c.json({ status });
    },
  );

  app.post(
    '/api/workspaces/:id/mcp/disconnect',
    zValidator('json', mcpServerNameSchema),
    async (c) => {
      const workspaceId = c.req.param('id');
      const { name } = c.req.valid('json');
      const workspace = getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const status = await mcp.disconnectServer(workspace.path, name);
      return c.json({ status });
    },
  );

  app.post('/api/workspaces/:id/mcp/restart', async (c) => {
    const workspaceId = c.req.param('id');
    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    await mcp.shutdownWorkspace(workspace.path);
    await mcp.initializeWorkspace(workspace.path);
    const status = await mcp.getAllServerStatus(workspace.path);
    return c.json({ status });
  });
}
