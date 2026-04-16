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

// Cache for discovered skills
const skillsCache: Map<string, SkillInfo> = new Map();
let lastScanPath: string | null = null;

/**
 * Scan for skills in the workspace's .agents/skills directory.
 * Skills are discovered from SKILL.md files in subdirectories.
 */
export async function scanSkills(workspacePath: string): Promise<SkillInfo[]> {
  const skillsDir = join(workspacePath, '.agents', 'skills');

  // Return cached if same workspace
  if (lastScanPath === workspacePath && skillsCache.size > 0) {
    return Array.from(skillsCache.values());
  }

  skillsCache.clear();
  lastScanPath = workspacePath;

  if (!existsSync(skillsDir)) {
    return [];
  }

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

        const skillInfo: SkillInfo = {
          name: frontmatter.name as string,
          description: frontmatter.description as string,
          location: skillMdPath,
          content: content.trim(),
          userInvocable: frontmatter['user-invocable'] !== false,
        };

        skillsCache.set(skillInfo.name, skillInfo);
      } catch (err) {
        console.warn(`Failed to read SKILL.md in ${folder.name}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to scan skills directory:', err);
    return [];
  }

  return Array.from(skillsCache.values());
}

/**
 * Get a specific skill by name.
 */
export async function getSkill(name: string, workspacePath: string): Promise<SkillInfo | null> {
  // Ensure cache is populated
  if (lastScanPath !== workspacePath) {
    await scanSkills(workspacePath);
  }
  return skillsCache.get(name) || null;
}

/**
 * Get all available skills for a workspace.
 */
export async function listSkills(workspacePath: string): Promise<SkillInfo[]> {
  return scanSkills(workspacePath);
}

/**
 * Get skills filtered by preconfig permissions.
 * - undefined/null: All skills available (default)
 * - []: No skills available
 * - ["name", ...]: Only these named skills
 */
export async function getAvailableSkills(
  workspacePath: string,
  allowedSkills: string[] | null | undefined
): Promise<SkillInfo[]> {
  const allSkills = await scanSkills(workspacePath);

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

/**
 * Clear the skills cache (useful for testing or force refresh).
 */
export function clearSkillsCache(): void {
  skillsCache.clear();
  lastScanPath = null;
}
