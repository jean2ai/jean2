import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import matter from 'gray-matter';
import type { Preconfig, PreconfigMode } from '@jean2/shared';
import { getPreconfigsPath } from '../env';
import { DEFAULT_PREAMBLES } from './defaults';

const PRECONFIGS_DIR = getPreconfigsPath();

async function ensureDir(): Promise<void> {
  if (existsSync(PRECONFIGS_DIR)) {
    return;
  }
  await mkdir(PRECONFIGS_DIR, { recursive: true });
}

export function getPreconfigMdPath(id: string): string {
  return join(PRECONFIGS_DIR, `${id}.md`);
}

export function getPreconfigJsonPath(id: string): string {
  return join(PRECONFIGS_DIR, `${id}.json`);
}

export async function preconfigExists(id: string): Promise<{ md: boolean; json: boolean }> {
  await ensureDir();
  const mdPath = getPreconfigMdPath(id);
  const jsonPath = getPreconfigJsonPath(id);
  return {
    md: existsSync(mdPath),
    json: existsSync(jsonPath),
  };
}

function parsePreconfigMd(content: string): Preconfig {
  const { data, content: body } = matter(content);

  return {
    id: data.id || '',
    name: data.name || '',
    description: data.description || '',
    systemPrompt: body.trim(),
    tools: data.tools ?? null,
    model: data.model ?? null,
    provider: data.provider ?? null,
    variant: data.variant ?? null,
    settings: data.settings ?? null,
    isDefault: data.isDefault ?? false,
    mode: data.mode,
    canSpawnSubagents: data.canSpawnSubagents,
    skills: data.skills ?? null,
  };
}

/**
 * Validate canSpawnSubagents arrays against known subagent IDs.
 * This is a post-processing step to avoid circular dependencies.
 */
async function validatePreconfigs(preconfigs: Preconfig[]): Promise<Preconfig[]> {
  // Build a set of known subagent IDs from the preconfigs list
  const knownSubagentIds = new Set(
    preconfigs
      .filter(p => {
        const mode = p.mode ?? 'primary';
        return mode === 'subagent' || mode === 'both';
      })
      .map(p => p.id)
  );

  // Validate each preconfig's canSpawnSubagents array
  for (const preconfig of preconfigs) {
    if (Array.isArray(preconfig.canSpawnSubagents)) {
      const validIds = preconfig.canSpawnSubagents.filter(id => {
        if (!knownSubagentIds.has(id)) {
          console.warn(`[preconfig] Unknown subagent ID "${id}" in canSpawnSubagents for "${preconfig.id}"`);
          return false;
        }
        return true;
      });

      if (validIds.length === 0) {
        console.warn(`[preconfig] canSpawnSubagents for "${preconfig.id}" has no valid IDs, disabling subagent spawning`);
        preconfig.canSpawnSubagents = false;
      } else if (validIds.length !== preconfig.canSpawnSubagents.length) {
        preconfig.canSpawnSubagents = validIds;
      }
    }
  }

  return preconfigs;
}

function serializePreconfigMd(preconfig: Preconfig): string {
  const { id: _id, systemPrompt, ...frontmatterData } = preconfig;
  const frontmatter = Object.fromEntries(
    Object.entries(frontmatterData).filter(([, v]) => v !== undefined)
  );
  return matter.stringify(systemPrompt || '', frontmatter);
}

function getDefaultPreamble(id: string): string | null {
  return DEFAULT_PREAMBLES[id] || null;
}

export async function initializePreconfigs(): Promise<void> {
  await ensureDir();

  let installed = 0;

  // Check and install each default preconfig individually
  for (const defaultId of Object.keys(DEFAULT_PREAMBLES)) {
    const { md, json } = await preconfigExists(defaultId);

    if (!md && !json) {
      const preamble = getDefaultPreamble(defaultId);
      if (preamble) {
        const mdPath = getPreconfigMdPath(defaultId);
        await writeFile(mdPath, preamble);
        installed++;
      }
    }
  }



  if (installed > 0) {
    console.log(`Installed ${installed} default preconfig(s)`);
  }
}

export async function listPreconfigs(): Promise<Preconfig[]> {
  await ensureDir();

  const files = await readdir(PRECONFIGS_DIR).catch(() => []);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  // Create a set of ids that have .md files (for precedence check)
  const mdIds = new Set(mdFiles.map(f => f.replace(/\.md$/, '')));

  const preconfigs: Preconfig[] = [];

  // Parse .md files first
  for (const file of mdFiles) {
    try {
      const content = await readFile(join(PRECONFIGS_DIR, file), 'utf-8');
      const parsed = parsePreconfigMd(content);
      const id = parsed.id || file.replace(/\.md$/, '');
      preconfigs.push({ ...parsed, id });
    } catch (e) {
      console.error(`Failed to read preconfig ${file}:`, e);
    }
  }

  // Parse .json files, but skip if corresponding .md exists
  for (const file of jsonFiles) {
    const id = file.replace(/\.json$/, '');
    if (mdIds.has(id)) {
      continue; // .md takes precedence
    }
    try {
      const content = await readFile(join(PRECONFIGS_DIR, file), 'utf-8');
      preconfigs.push(JSON.parse(content) as Preconfig);
    } catch (e) {
      console.error(`Failed to read preconfig ${file}:`, e);
    }
  }

  // Validate canSpawnSubagents arrays against known subagent IDs
  const validated = await validatePreconfigs(preconfigs);

  return validated.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getPreconfig(id: string): Promise<Preconfig | null> {
  await ensureDir();

  // Check for .md first (precedence)
  const mdPath = getPreconfigMdPath(id);
  if (existsSync(mdPath)) {
    try {
      const content = await readFile(mdPath, 'utf-8');
      const parsed = parsePreconfigMd(content);
      return { ...parsed, id };
    } catch (_e) {
      return null;
    }
  }

  // Fall back to .json
  const jsonPath = getPreconfigJsonPath(id);
  try {
    const content = await readFile(jsonPath, 'utf-8');
    return JSON.parse(content) as Preconfig;
  } catch (_e) {
    return null;
  }
}

export async function createPreconfig(
  preconfig: Omit<Preconfig, 'id'> & { id?: string },
  format?: 'json' | 'md'
): Promise<Preconfig> {
  await ensureDir();

  const newPreconfig: Preconfig = {
    ...preconfig,
    id: preconfig.id || randomUUID(),
  };

  if (format === 'md') {
    await writeFile(getPreconfigMdPath(newPreconfig.id), serializePreconfigMd(newPreconfig));
  } else {
    await writeFile(
      getPreconfigJsonPath(newPreconfig.id),
      JSON.stringify(newPreconfig, null, 2)
    );
  }

  return newPreconfig;
}

export async function updatePreconfig(
  id: string,
  updates: Partial<Omit<Preconfig, 'id'>>
): Promise<Preconfig | null> {
  const existing = await getPreconfig(id);
  if (!existing) return null;

  const updated: Preconfig = {
    ...existing,
    ...updates,
    id, // Ensure id is not changed
  };

  const { md, json } = await preconfigExists(id);

  if (md) {
    await writeFile(getPreconfigMdPath(id), serializePreconfigMd(updated));
  } else if (json) {
    await writeFile(
      getPreconfigJsonPath(id),
      JSON.stringify(updated, null, 2)
    );
  }

  return updated;
}

export async function deletePreconfig(id: string): Promise<boolean> {
  const { md, json } = await preconfigExists(id);

  if (md) {
    try {
      await unlink(getPreconfigMdPath(id));
      return true;
    } catch (_e) {
      return false;
    }
  }

  if (json) {
    try {
      await unlink(getPreconfigJsonPath(id));
      return true;
    } catch (_e) {
      return false;
    }
  }

  return false;
}

export async function getDefaultPreconfig(): Promise<Preconfig | null> {
  const preconfigs = await listPreconfigs();
  return preconfigs.find(p => p.isDefault) || preconfigs[0] || null;
}

/**
 * List preconfigs filtered by mode
 */
export async function listPreconfigsByMode(mode?: PreconfigMode): Promise<Preconfig[]> {
  const preconfigs = await listPreconfigs();

  if (!mode) return preconfigs;

  return preconfigs.filter(p => {
    const preconfigMode = p.mode ?? 'primary';
    return preconfigMode === mode;
  });
}

/**
 * List only subagent preconfigs (includes 'both' mode agents)
 */
export async function listSubagentPreconfigs(): Promise<Preconfig[]> {
  const preconfigs = await listPreconfigs();
  return preconfigs.filter(p => {
    const mode = p.mode ?? 'primary';
    return mode === 'subagent' || mode === 'both';
  });
}

/**
 * List only primary preconfigs - user-facing (includes 'both' mode agents)
 */
export async function listPrimaryPreconfigs(): Promise<Preconfig[]> {
  const preconfigs = await listPreconfigs();
  return preconfigs.filter(p => {
    const mode = p.mode ?? 'primary';
    return mode === 'primary' || mode === 'both';
  });
}

/**
 * Get available subagent types for Task tool
 */
export async function getAvailableSubagentTypes(): Promise<string[]> {
  const subagents = await listSubagentPreconfigs();
  return subagents.map(s => s.id);
}
