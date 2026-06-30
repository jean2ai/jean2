import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR } from './storage';

export async function readAgentMemoryFile(
  agentId: string,
  filename: 'USER.md' | 'MEMORY.md',
): Promise<string | null> {
  const filePath = join(AGENTS_DIR, agentId, filename);
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function writeAgentMemoryFile(
  agentId: string,
  filename: 'USER.md' | 'MEMORY.md',
  content: string,
): Promise<void> {
  const filePath = join(AGENTS_DIR, agentId, filename);
  const dir = join(AGENTS_DIR, agentId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, content, 'utf-8');
}

export async function getAgentMemory(agentId: string): Promise<{ user: string; memory: string }> {
  return {
    user: (await readAgentMemoryFile(agentId, 'USER.md')) ?? '',
    memory: (await readAgentMemoryFile(agentId, 'MEMORY.md')) ?? '',
  };
}

export async function updateAgentMemory(
  agentId: string,
  target: 'user' | 'memory',
  content: string,
): Promise<void> {
  const filename = target === 'user' ? 'USER.md' : 'MEMORY.md';
  await writeAgentMemoryFile(agentId, filename, content);
}
