import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import type { PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';

type SkillManageAction = 'create' | 'update' | 'patch' | 'delete';

export interface SkillManageResult {
  success: boolean;
  title?: string;
  action?: SkillManageAction;
  name?: string;
  description?: string;
  path?: string;
  summary?: string;
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

function getSkillDir(workspacePath: string, safeName: string): string {
  return join(workspacePath, '.agents', 'skills', safeName);
}

function getSkillMdPath(workspacePath: string, safeName: string): string {
  return join(getSkillDir(workspacePath, safeName), 'SKILL.md');
}

function ensurePathWithinSkills(workspacePath: string, skillPath: string): boolean {
  const skillsRoot = resolve(workspacePath, '.agents', 'skills');
  const resolved = resolve(skillPath);
  return resolved.startsWith(skillsRoot + '/') || resolved === skillsRoot;
}

async function ensureSkillsDir(workspacePath: string): Promise<void> {
  const dir = join(workspacePath, '.agents', 'skills');
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
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
        enum: ['create', 'update', 'patch', 'delete'],
        description: 'The action to perform.',
      },
      name: {
        type: 'string' as const,
        description: 'Skill name (will be normalized to a safe slug).',
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
        description: 'Exact text to find for patch action. Must match exactly once.',
      },
      newString: {
        type: 'string' as const,
        description: 'Replacement text for patch action.',
      },
    },
    required: ['action', 'name'],
  },
  timeout: 10000,
};

export async function executeSkillManageTool(
  input: Record<string, unknown>,
  workspacePath: string,
  permissionRisk: PermissionRiskLevel,
  askFn?: (ask: PermissionAsk) => Promise<unknown>,
): Promise<SkillManageResult> {
  const action = input.action as SkillManageAction;
  const rawName = input.name as string;
  const description = input.description as string | undefined;
  const content = input.content as string | undefined;
  const oldString = input.oldString as string | undefined;
  const newString = input.newString as string | undefined;

  if (!action || !['create', 'update', 'patch', 'delete'].includes(action)) {
    return { success: false, error: 'Invalid action. Must be create, update, patch, or delete.' };
  }

  const nameError = validateSkillName(rawName);
  if (nameError) {
    return { success: false, error: nameError };
  }

  const safeName = sanitizeSkillName(rawName);
  if (!safeName) {
    return { success: false, error: 'Skill name is invalid after normalization.' };
  }

  const skillMdPath = getSkillMdPath(workspacePath, safeName);
  if (!ensurePathWithinSkills(workspacePath, skillMdPath)) {
    return { success: false, error: 'Skill path resolves outside workspace skills directory.' };
  }

  const relativePath = `.agents/skills/${safeName}/SKILL.md`;

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

      if (existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${safeName}" already exists. Use update or patch instead.` };
      }

      await ensureSkillsDir(workspacePath);
      const skillDir = getSkillDir(workspacePath, safeName);
      await mkdir(skillDir, { recursive: true });

      const fileContent = buildFrontmatter(safeName, description) + '\n' + content + '\n';
      await writeFile(skillMdPath, fileContent, 'utf-8');

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

      if (!existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${safeName}" does not exist. Use create first.` };
      }

      let existingContent: string;
      try {
        existingContent = await readFile(skillMdPath, 'utf-8');
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
      const newFileContent = buildFrontmatter(safeName, effectiveDescription) + '\n' + content + '\n';
      await writeFile(skillMdPath, newFileContent, 'utf-8');

      return {
        success: true,
        title: `Skill updated: ${safeName}`,
        action: 'update',
        name: safeName,
        description: effectiveDescription,
        path: relativePath,
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

      if (!existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${safeName}" does not exist. Use create first.` };
      }

      let existingContent: string;
      try {
        existingContent = await readFile(skillMdPath, 'utf-8');
      } catch {
        return { success: false, error: 'Failed to read existing skill file.' };
      }

      // Count matches
      const matches = existingContent.split(oldString).length - 1;
      if (matches === 0) {
        return { success: false, error: 'oldString not found in skill file.' };
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

      await writeFile(skillMdPath, finalContent, 'utf-8');

      return {
        success: true,
        title: `Skill patched: ${safeName}`,
        action: 'patch',
        name: safeName,
        description: effectiveDescription,
        path: relativePath,
        summary: 'Replaced one matching block.',
      };
    }

    case 'delete': {
      if (!existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${safeName}" does not exist.` };
      }

      const skillDir = getSkillDir(workspacePath, safeName);
      await rm(skillDir, { recursive: true, force: true });

      return {
        success: true,
        title: `Skill deleted: ${safeName}`,
        action: 'delete',
        name: safeName,
        path: relativePath,
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
