import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { SkillInfo } from '@jean2/sdk';

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { frontmatter, content } where content is the markdown without frontmatter.
 */
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  // Frontmatter is between --- markers at the start
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const frontmatterText = match[1];
  const content = match[2];

  // Simple YAML parser for flat key-value pairs
  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      // Remove quotes if present
      const unquoted = value.replace(/^['"]|['"]$/g, '');
      frontmatter[key] = unquoted;
    }
  }

  return { frontmatter, content };
}

/**
 * Scan a single skills directory for SKILL.md files.
 * Returns discovered skills with parsed frontmatter.
 */
export async function scanSkillsDir(skillsDir: string): Promise<SkillInfo[]> {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: SkillInfo[] = [];

  try {
    const skillFolders = await readdir(skillsDir, { withFileTypes: true });

    for (const folder of skillFolders) {
      if (!folder.isDirectory()) continue;

      const skillMdPath = join(skillsDir, folder.name, 'SKILL.md');

      try {
        if (!existsSync(skillMdPath)) continue;

        const raw = await readFile(skillMdPath, 'utf-8');
        const { frontmatter, content } = parseFrontmatter(raw);

        // Validate required fields
        if (!frontmatter.name || !frontmatter.description) {
          console.warn(`Invalid SKILL.md in ${folder.name}: missing name or description`);
          continue;
        }

        skills.push({
          name: frontmatter.name as string,
          description: frontmatter.description as string,
          location: skillMdPath,
          content: content.trim(),
          userInvocable: frontmatter['user-invocable'] !== false,
        });
      } catch (err) {
        console.warn(`Failed to read SKILL.md in ${folder.name}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to scan skills directory:', err);
  }

  return skills;
}

/**
 * Alias for scanSkillsDir for use by skill-manage-tool which receives
 * a pre-resolved skills directory path.
 */
export async function scanSkillsFromDir(skillsDir: string): Promise<SkillInfo[]> {
  return scanSkillsDir(skillsDir);
}

/**
 * Scan for skills in the workspace's .agents/skills directory.
 * If additionalSkillsDir is provided, also scans that directory and merges results.
 * Workspace skills take precedence on name collision (scanned first).
 * Always reads fresh from disk so newly created skills are immediately discoverable.
 */
export async function scanSkills(workspacePath: string, additionalSkillsDir?: string): Promise<SkillInfo[]> {
  const workspaceSkillsDir = join(workspacePath, '.agents', 'skills');
  const skills: SkillInfo[] = [];

  // Scan workspace skills
  const wsSkills = await scanSkillsDir(workspaceSkillsDir);
  skills.push(...wsSkills);

  // Scan agent skills (if provided)
  if (additionalSkillsDir) {
    const agentSkills = await scanSkillsDir(additionalSkillsDir);
    // Only add agent skills whose name isn't already present (workspace wins)
    const existingNames = new Set(skills.map(s => s.name));
    for (const skill of agentSkills) {
      if (!existingNames.has(skill.name)) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

/**
 * Get a specific skill by name.
 */
export async function getSkill(name: string, workspacePath: string, additionalSkillsDir?: string): Promise<SkillInfo | null> {
  const skills = await scanSkills(workspacePath, additionalSkillsDir);
  return skills.find(s => s.name === name) || null;
}

/**
 * Get all available skills for a workspace.
 */
export async function listSkills(workspacePath: string, additionalSkillsDir?: string): Promise<SkillInfo[]> {
  return scanSkills(workspacePath, additionalSkillsDir);
}

/**
 * Get skills filtered by preconfig permissions.
 * - undefined/null: All skills available (default)
 * - []: No skills available
 * - ["name", ...]: Only these named skills
 */
export async function getAvailableSkills(
  workspacePath: string,
  allowedSkills: string[] | null | undefined,
  additionalSkillsDir?: string,
): Promise<SkillInfo[]> {
  const allSkills = await scanSkills(workspacePath, additionalSkillsDir);

  // undefined or null = all available
  if (allowedSkills === undefined || allowedSkills === null) {
    return allSkills;
  }

  // Empty array = none available
  if (allowedSkills.length === 0) {
    return [];
  }

  // Filter by allowed names
  return allSkills.filter(skill => allowedSkills.includes(skill.name));
}

/**
 * Format skills list for display in tool description.
 */
export function formatSkillsList(skills: SkillInfo[]): string {
  if (skills.length === 0) {
    return 'No skills are currently available.';
  }

  return skills.map(skill => `- **${skill.name}**: ${skill.description}`).join('\n');
}
