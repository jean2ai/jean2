import { readFile, writeFile, mkdir, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';
import { scanSkillsFromDir } from './registry';

type SkillManageAction = 'list' | 'create' | 'update' | 'patch' | 'delete';

export interface SkillManageResult {
  success: boolean;
  title?: string;
  action?: SkillManageAction;
  name?: string;
  description?: string;
  path?: string;
  summary?: string;
  skills?: Array<{ name: string; description: string }>;
  error?: string;
}

function sanitizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateSkillName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Skill name cannot be empty.';
  }

  if (name.includes('/') || name.includes('\\')) {
    return 'Skill name cannot contain path separators.';
  }

  if (name.startsWith('.')) {
    return 'Skill name cannot start with a dot.';
  }

  if (name.includes('..')) {
    return 'Skill name cannot contain "..".';
  }

  return null;
}

function buildFrontmatter(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n`;
}

function getSkillDir(skillsDir: string, safeName: string): string {
  return join(skillsDir, safeName);
}

function getSkillMdPath(skillsDir: string, safeName: string): string {
  return join(getSkillDir(skillsDir, safeName), 'SKILL.md');
}

async function ensureSkillsDir(skillsDir: string): Promise<void> {
  if (!existsSync(skillsDir)) {
    await mkdir(skillsDir, { recursive: true });
  }
}

/**
 * Resolve a user-provided skill name to the actual on-disk folder name.
 * Tries exact sanitized match first, then falls back to case-insensitive
 * matching against both the folder name and the frontmatter `name` field.
 * Returns the resolved folder name, or null if not found.
 */
async function resolveSkillFolder(
  rawName: string,
  skillsDir: string,
): Promise<{ folderName: string; skillMdPath: string } | null> {
  const safeName = sanitizeSkillName(rawName);

  // Fast path: exact folder match
  const directPath = getSkillMdPath(skillsDir, safeName);
  if (existsSync(directPath)) {
    return { folderName: safeName, skillMdPath: directPath };
  }

  // Fallback: scan all skills and match case-insensitively by folder name or frontmatter name
  if (!existsSync(skillsDir)) {
    return null;
  }

  try {
    const folders = await readdir(skillsDir, { withFileTypes: true });
    for (const folder of folders) {
      if (!folder.isDirectory()) continue;

      // Case-insensitive folder name match
      if (folder.name.toLowerCase() === safeName.toLowerCase()) {
        const p = join(skillsDir, folder.name, 'SKILL.md');
        if (existsSync(p)) {
          return { folderName: folder.name, skillMdPath: p };
        }
      }

      // Frontmatter name match (case-insensitive)
      const mdPath = join(skillsDir, folder.name, 'SKILL.md');
      if (!existsSync(mdPath)) continue;
      try {
        const raw = await readFile(mdPath, 'utf-8');
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fmMatch) {
          const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            const fmName = nameMatch[1].replace(/^['"]|['"]$/g, '').trim().toLowerCase();
            if (fmName === safeName.toLowerCase()) {
              return { folderName: folder.name, skillMdPath: mdPath };
            }
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // ignore readdir errors
  }

  return null;
}

/**
 * Get a short list of available skill names for error messages.
 */
async function getAvailableSkillNames(skillsDir: string): Promise<string[]> {
  const skills = await scanSkillsFromDir(skillsDir);
  return skills.map(s => s.name);
}

/**
 * Build the skill_manage tool description with a dynamic list of existing skills.
 * This gives the LLM visibility into which skill names exist, so it doesn't
 * have to guess when calling update/patch/delete.
 */
export async function buildSkillManageToolDescription(
  skillsDir: string,
): Promise<string> {
  const skills = await scanSkillsFromDir(skillsDir);

  const lines = [
    'Create, update, patch, delete, or list workspace skills.',
    '',
    'Workspace skills are reusable procedures and workflows stored as SKILL.md files in .agents/skills/.',
    '',
    'Actions:',
    '- list: List all existing skills with their names and descriptions. No other parameters needed.',
    '- create: Create a new skill. Requires name, description, and content (markdown body).',
    '- update: Replace a skill\'s full body and optionally update description. Requires name and content.',
    '- patch: Targeted string replacement in a skill\'s SKILL.md. Requires name, oldString, newString.',
    '- delete: Remove a skill entirely. Requires name only.',
    '',
    'Skill bodies should be procedural: When to Use, Procedure steps, Pitfalls, Verification.',
    '',
  ];

  if (skills.length > 0) {
    lines.push('Existing skills in this workspace:');
    for (const skill of skills) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }
    lines.push('');
    lines.push('For patch/update, use the exact name shown above. Skill names are matched case-insensitively.');
  } else {
    lines.push('No skills exist yet. Use create to make the first one.');
  }

  return lines.join('\n');
}

export interface SkillManageInput {
  action: SkillManageAction;
  name: string;
  description?: string;
  content?: string;
  oldString?: string;
  newString?: string;
}

export const skillManageToolDefinition = {
  name: 'skill_manage',
  description: `Create, update, patch, or delete workspace skills.

Workspace skills are reusable procedures and workflows stored as SKILL.md files in .agents/skills/.

Actions:
- list: List all existing skills with their names and descriptions. No other parameters needed.
- create: Create a new skill. Requires name, description, and content (markdown body).
- update: Replace a skill's full body and optionally update description. Requires name and content.
- patch: Targeted string replacement in a skill's SKILL.md. Requires name, oldString, newString.
- delete: Remove a skill entirely. Requires name only.

Skill bodies should be procedural: When to Use, Procedure steps, Pitfalls, Verification.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['list', 'create', 'update', 'patch', 'delete'],
        description: 'The action to perform.',
      },
      name: {
        type: 'string' as const,
        description: 'Skill name (will be normalized to a safe slug). Matched case-insensitively against existing skills.',
      },
      description: {
        type: 'string' as const,
        description: 'Concise trigger/use description for the skill. Required for create. Optional for update/patch.',
      },
      content: {
        type: 'string' as const,
        description: 'Markdown body for create/update actions. Not full frontmatter — just the body.',
      },
      oldString: {
        type: 'string' as const,
        description: 'Exact text to find for patch action. Must match exactly once. Load the skill first to see the exact content.',
      },
      newString: {
        type: 'string' as const,
        description: 'Replacement text for patch action.',
      },
    },
    required: ['action'],
  },
  timeout: 10000,
};

export async function executeSkillManageTool(
  input: Record<string, unknown>,
  skillsDir: string,
  permissionRisk: PermissionRiskLevel,
  askFn?: (ask: PermissionAsk) => Promise<unknown>,
): Promise<SkillManageResult> {
  const action = input.action as SkillManageAction;
  const rawName = input.name as string;
  const description = input.description as string | undefined;
  const content = input.content as string | undefined;
  const oldString = input.oldString as string | undefined;
  const newString = input.newString as string | undefined;

  if (!action || !['list', 'create', 'update', 'patch', 'delete'].includes(action)) {
    return { success: false, error: 'Invalid action. Must be list, create, update, patch, or delete.' };
  }

  // `list` is read-only and doesn't need a name or permission
  if (action === 'list') {
    const skills = await scanSkillsFromDir(skillsDir);
    if (skills.length === 0) {
      return {
        success: true,
        title: 'No skills found',
        action: 'list',
        summary: 'No skills exist in this workspace yet.',
        skills: [],
      };
    }
    return {
      success: true,
      title: `${skills.length} skill${skills.length === 1 ? '' : 's'} found`,
      action: 'list',
      summary: skills.map(s => `${s.name}: ${s.description}`).join('\n'),
      skills: skills.map(s => ({ name: s.name, description: s.description })),
    };
  }

  // All other actions require a name
  const nameError = validateSkillName(rawName);
  if (nameError) {
    return { success: false, error: nameError };
  }

  const safeName = sanitizeSkillName(rawName);
  if (!safeName) {
    return { success: false, error: 'Skill name is invalid after normalization.' };
  }

  const relativePath = `${safeName}/SKILL.md`;

  // Request permission if risk level is set
  if (permissionRisk !== 'none' && askFn) {
    const ask: PermissionAsk = {
      type: 'permission',
      question: `Allow skill ${action}: ${safeName}?`,
      description: `Action: ${action}\nSkill: ${safeName}${description ? `\nDescription: ${description.slice(0, 200)}` : ''}${content ? `\nContent: ${content.slice(0, 200)}` : ''}`,
      risk: permissionRisk,
      resource: 'file',
      action: 'write',
      paths: [relativePath],
    };
    const approved = await askFn(ask);
    if (!approved) {
      return { success: false, error: 'USER_REJECTION' };
    }
  }

  switch (action) {
    case 'create': {
      if (!description) {
        return { success: false, error: 'description is required for create action.' };
      }
      if (!content) {
        return { success: false, error: 'content is required for create action.' };
      }

      const directPath = getSkillMdPath(skillsDir, safeName);
      if (existsSync(directPath)) {
        return { success: false, error: `Skill "${safeName}" already exists. Use update or patch instead.` };
      }

      await ensureSkillsDir(skillsDir);
      const skillDir = getSkillDir(skillsDir, safeName);
      await mkdir(skillDir, { recursive: true });

      const fileContent = buildFrontmatter(safeName, description) + '\n' + content + '\n';
      await writeFile(directPath, fileContent, 'utf-8');

      return {
        success: true,
        title: `Skill created: ${safeName}`,
        action: 'create',
        name: safeName,
        description,
        path: relativePath,
        summary: 'Created workspace skill.',
      };
    }

    case 'update': {
      if (!content) {
        return { success: false, error: 'content is required for update action.' };
      }

      const resolved = await resolveSkillFolder(rawName, skillsDir);
      if (!resolved) {
        const available = await getAvailableSkillNames(skillsDir);
        return {
          success: false,
          error: `Skill "${rawName}" does not exist.${available.length ? ` Available skills: ${available.join(', ')}` : ' No skills exist yet. Use create first.'}`,
        };
      }

      // For update, if the LLM passes a different-cased name, use the resolved folder name
      const resolvedFolder = resolved.folderName;
      const resolvedRelativePath = `${resolvedFolder}/SKILL.md`;
      const resolvedPath = resolved.skillMdPath;

      let existingContent: string;
      try {
        existingContent = await readFile(resolvedPath, 'utf-8');
      } catch {
        return { success: false, error: 'Failed to read existing skill file.' };
      }

      // Parse existing frontmatter to preserve/update description
      const frontmatterMatch = existingContent.match(/^---\n([\s\S]*?)\n---\n?/);
      let existingDescription = '';

      if (frontmatterMatch) {
        const fmText = frontmatterMatch[1];
        const descMatch = fmText.match(/^description:\s*(.+)$/m);
        if (descMatch) {
          existingDescription = descMatch[1].replace(/^['"]|['"]$/g, '');
        }
      }

      const effectiveDescription = description ?? existingDescription;
      // Preserve the existing frontmatter name to avoid renaming the skill unintentionally
      const existingFmNameMatch = existingContent.match(/^name:\s*(.+)$/m);
      const effectiveName = existingFmNameMatch ? existingFmNameMatch[1].replace(/^['"]|['"]$/g, '').trim() : resolvedFolder;
      const newFileContent = buildFrontmatter(effectiveName, effectiveDescription) + '\n' + content + '\n';
      await writeFile(resolvedPath, newFileContent, 'utf-8');

      return {
        success: true,
        title: `Skill updated: ${effectiveName}`,
        action: 'update',
        name: effectiveName,
        description: effectiveDescription,
        path: resolvedRelativePath,
        summary: 'Replaced skill body.',
      };
    }

    case 'patch': {
      if (!oldString) {
        return { success: false, error: 'oldString is required for patch action.' };
      }
      if (newString === undefined || newString === null) {
        return { success: false, error: 'newString is required for patch action.' };
      }

      const resolved = await resolveSkillFolder(rawName, skillsDir);
      if (!resolved) {
        const available = await getAvailableSkillNames(skillsDir);
        return {
          success: false,
          error: `Skill "${rawName}" does not exist.${available.length ? ` Available skills: ${available.join(', ')}` : ' No skills exist yet. Use create first.'}`,
        };
      }

      const resolvedPath = resolved.skillMdPath;
      const resolvedFolder = resolved.folderName;
      const resolvedRelativePath = `${resolvedFolder}/SKILL.md`;

      let existingContent: string;
      try {
        existingContent = await readFile(resolvedPath, 'utf-8');
      } catch {
        return { success: false, error: 'Failed to read existing skill file.' };
      }

      // Count matches
      const matches = existingContent.split(oldString).length - 1;
      if (matches === 0) {
        return {
          success: false,
          error: `oldString not found in skill file. Load the skill via the "skill" tool first to see the exact content, then copy the exact text to oldString.`,
        };
      }
      if (matches > 1) {
        return { success: false, error: `oldString matched ${matches} locations. Provide a more specific oldString.` };
      }

      const patchedContent = existingContent.replace(oldString, newString);

      // If description is provided, update frontmatter
      let finalContent = patchedContent;
      let effectiveDescription: string | undefined;

      if (description) {
        effectiveDescription = description;
        // Replace description in frontmatter
        finalContent = finalContent.replace(
          /^(description:\s*).*$/m,
          `$1${description}`,
        );
      } else {
        // Extract current description for result
        const descMatch = finalContent.match(/^description:\s*(.+)$/m);
        if (descMatch) {
          effectiveDescription = descMatch[1].replace(/^['"]|['"]$/g, '');
        }
      }

      await writeFile(resolvedPath, finalContent, 'utf-8');

      // Resolve the frontmatter name for the result
      const fmNameMatch = finalContent.match(/^name:\s*(.+)$/m);
      const resultName = fmNameMatch ? fmNameMatch[1].replace(/^['"]|['"]$/g, '').trim() : resolvedFolder;

      return {
        success: true,
        title: `Skill patched: ${resultName}`,
        action: 'patch',
        name: resultName,
        description: effectiveDescription,
        path: resolvedRelativePath,
        summary: 'Replaced one matching block.',
      };
    }

    case 'delete': {
      const resolved = await resolveSkillFolder(rawName, skillsDir);
      if (!resolved) {
        const available = await getAvailableSkillNames(skillsDir);
        return {
          success: false,
          error: `Skill "${rawName}" does not exist.${available.length ? ` Available skills: ${available.join(', ')}` : ''}`,
        };
      }

      const resolvedFolder = resolved.folderName;
      const resolvedRelativePath = `${resolvedFolder}/SKILL.md`;
      const skillDir = getSkillDir(skillsDir, resolvedFolder);
      await rm(skillDir, { recursive: true, force: true });

      return {
        success: true,
        title: `Skill deleted: ${resolvedFolder}`,
        action: 'delete',
        name: resolvedFolder,
        path: resolvedRelativePath,
        summary: 'Removed workspace skill directory.',
      };
    }
  }
}

export const SKILL_MANAGE_GUIDANCE = `You can create and update workspace skills using the skill_manage tool.
Workspace skills are reusable procedures/workflows stored under .agents/skills in the current workspace.

Use memory for compact durable facts.
Use skill_manage for repeatable multi-step procedures, debugging workflows, conventions, and verification steps that are too procedural for MEMORY.md.

When to create or update a skill:
- After completing a complex reusable workflow.
- After debugging through errors and discovering the working path.
- When the user corrects your approach in a way that should affect future similar tasks.
- When you discover workspace-specific procedures, pitfalls, commands, or verification steps.

When not to create a skill:
- For one-off facts or temporary context.
- For secrets, credentials, raw logs, or large code dumps.
- For obvious information already present in AGENTS.md or an existing skill.

Before creating a new skill, consider whether an existing skill should be patched instead.
Prefer patch over update for small changes.
Keep skill descriptions concise and trigger-focused because descriptions are used to decide when to load a skill.
Keep skill bodies procedural and verification-oriented.`;
