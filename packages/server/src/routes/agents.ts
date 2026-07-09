import { Hono } from 'hono';
import {
  listAgents,
  getAgent,
  promotePreconfig,
  demoteAgent,
} from '@/agents/storage';
import { getAgentMemory, updateAgentMemory } from '@/agents/memory';
import { NotFoundError } from '@/utils/http-errors';

export function registerAgentRoutes(app: Hono): void {
  app.get('/api/agents', async (c) => {
    const agents = await listAgents();
    return c.json({ agents });
  });

  app.get('/api/agents/:id', async (c) => {
    const agent = await getAgent(c.req.param('id'));
    if (!agent) throw new NotFoundError('Agent not found');
    return c.json({ agent });
  });

  app.post('/api/agents/:id/promote', async (c) => {
    const agent = await promotePreconfig(c.req.param('id'));
    return c.json({ agent });
  });

  app.delete('/api/agents/:id', async (c) => {
    await demoteAgent(c.req.param('id'));
    return c.json({ success: true });
  });

  app.get('/api/agents/:id/memory', async (c) => {
    const memory = await getAgentMemory(c.req.param('id'));
    return c.json(memory);
  });

  app.patch('/api/agents/:id/memory', async (c) => {
    const body = await c.req.json();
    await updateAgentMemory(c.req.param('id'), body.target, body.content);
    return c.json({ success: true });
  });
}
