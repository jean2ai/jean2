import { mkdir, rm, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Agent, Preconfig } from '@jean2/sdk';
import { getDataDir } from '@/paths';
import { getPreconfig } from '@/core/preconfig';
import { createWorkspace, updateWorkspace } from '@/store/workspaces';
import { deleteWorkspace } from '@/store/workspaces';

export const AGENTS_DIR = join(getDataDir(), 'agents');

export async function getAgentDirectory(id: string): Promise<string | null> {
  const dir = join(AGENTS_DIR, id);
  return existsSync(dir) ? dir : null;
}

export function isAgentSync(id: string): boolean {
  return existsSync(join(AGENTS_DIR, id));
}

export async function isAgent(id: string): Promise<boolean> {
  return existsSync(join(AGENTS_DIR, id));
}

export async function listAgents(): Promise<Agent[]> {
  if (!existsSync(AGENTS_DIR)) return [];
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  const agents: Agent[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const agent = await getAgent(entry.name);
      if (agent) agents.push(agent);
    }
  }
  return agents;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const agentDir = join(AGENTS_DIR, id);
  if (!existsSync(agentDir)) return null;

  const preconfig = await getPreconfig(id);
  if (!preconfig) return null;

  const stats = await stat(agentDir);
  return {
    ...preconfig,
    hasHome: existsSync(join(agentDir, 'home')),
    createdAt: stats.birthtime.toISOString(),
  };
}

export async function getPreconfigOrAgent(id: string): Promise<Preconfig | null> {
  return getPreconfig(id);
}

export async function promotePreconfig(preconfigId: string): Promise<Agent> {
  const preconfig = await getPreconfig(preconfigId);
  if (!preconfig) throw new Error('Preconfig not found');

  if (await isAgent(preconfigId)) throw new Error('Already an agent');

  const agentDir = join(AGENTS_DIR, preconfigId);
  await mkdir(join(agentDir, 'skills'), { recursive: true });
  await mkdir(join(agentDir, 'home', '.jean2'), { recursive: true });

  await createAgentHomeWorkspace(preconfigId);

  const agent = await getAgent(preconfigId);
  if (!agent) throw new Error('Failed to create agent');
  return agent;
}

export async function demoteAgent(id: string): Promise<void> {
  const agentDir = join(AGENTS_DIR, id);
  if (!existsSync(agentDir)) return;

  await removeAgentHomeWorkspace(id);
  await rm(agentDir, { recursive: true, force: true });
}

async function createAgentHomeWorkspace(agentId: string): Promise<void> {
  const homePath = join(AGENTS_DIR, agentId, 'home');
  const workspace = createWorkspace({
    id: `${agentId}-home`,
    name: `${agentId}-home`,
    path: homePath,
    isVirtual: true,
  });

  updateWorkspace(workspace.id, {
    settings: {
      ...workspace.settings,
      isAgentHome: true,
      agentId,
      memory: { enabled: true, permissionRisk: 'low' },
      skills: { managementEnabled: true, permissionRisk: 'low' },
      sessionSearch: { enabled: true, permissionRisk: 'low', includeToolResults: false },
      scheduling: { enabled: true, permissionRisk: 'low' },
    },
  });
}

async function removeAgentHomeWorkspace(agentId: string): Promise<void> {
  const homeId = `${agentId}-home`;
  deleteWorkspace(homeId);
}
