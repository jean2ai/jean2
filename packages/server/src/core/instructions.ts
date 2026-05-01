/**
 * Load instruction files (AGENTS.md) for system prompt
 *
 * Loads from two locations in order:
 * 1. Global: ~/.jean2/AGENTS.md
 * 2. Project: {workspace}/AGENTS.md
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getGlobalAgentsPath as getGlobalAgentsPathFromPaths } from '@/paths';

function getGlobalAgentsFilePath(): string {
  return getGlobalAgentsPathFromPaths();
}

export interface LoadedInstructions {
  global: string | null;
  project: string | null;
}

/**
 * Load instruction files from global and project locations
 * Returns null for each if file doesn't exist or is empty
 */
export async function loadInstructions(workspacePath?: string): Promise<LoadedInstructions> {
  const result: LoadedInstructions = {
    global: null,
    project: null,
  };

  // 1. Load global instructions
  if (existsSync(getGlobalAgentsFilePath())) {
    try {
      const content = await readFile(getGlobalAgentsFilePath(), 'utf-8');
      if (content.trim()) {
        result.global = content.trim();
      }
    } catch (err) {
      console.error('Failed to read global instructions:', err);
    }
  }

  // 2. Load project instructions (if workspace provided)
  if (workspacePath) {
    const projectPath = join(workspacePath, 'AGENTS.md');
    if (existsSync(projectPath)) {
      try {
        const content = await readFile(projectPath, 'utf-8');
        if (content.trim()) {
          result.project = content.trim();
        }
      } catch (err) {
        console.error('Failed to read project instructions:', err);
      }
    }
  }

  return result;
}

/**
 * Format loaded instructions into system prompt section
 * Global instructions come first, then project instructions
 */
export function formatInstructions(instructions: LoadedInstructions): string | null {
  const sections: string[] = [];

  if (instructions.global) {
    sections.push(`<instructions source="global">
${instructions.global}
</instructions>`);
  }

  if (instructions.project) {
    sections.push(`<instructions source="project">
${instructions.project}
</instructions>`);
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}

/**
 * Get the global AGENTS.md path (for init command)
 */
export function getGlobalAgentsPath(): string {
  return getGlobalAgentsFilePath();
}
