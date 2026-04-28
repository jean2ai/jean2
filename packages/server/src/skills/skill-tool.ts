import type { Tool } from 'ai';
import type { ToolDefinition } from '@jean2/sdk';
import { pathToFileURL } from 'url';
import { getSkill, getAvailableSkills, formatSkillsList } from './registry';

/**
 * Build the skill tool definition with dynamic description based on available skills.
 */
export async function buildSkillToolDefinition(
  workspacePath: string,
  allowedSkills: string[] | null | undefined,
  _sessionId: string,
): Promise<ToolDefinition | null> {
  const skills = await getAvailableSkills(workspacePath, allowedSkills);
  
  // If no skills available, return null to indicate tool should not be added
  if (skills.length === 0) {
    return null;
  }
  
  const skillList = formatSkillsList(skills);
  const examples = skills.slice(0, 3).map(s => `'${s.name}'`).join(', ');
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : '';
  
  const description = [
    'Load a specialized skill that provides domain-specific instructions and workflows.',
    '',
    'When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.',
    '',
    'The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.',
    '',
    'Tool output includes a `<skill_content name="...">` block with the loaded content.',
    '',
    'The following skills provide specialized sets of instructions for particular tasks.',
    'Invoke this tool to load a skill when a task matches one of the available skills listed below:',
    '',
    skillList,
  ].join('\n');
  
  return {
    name: 'skill',
    description,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: `The name of the skill from available_skills${hint}`,
        },
      },
      required: ['name'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        output: { type: 'string' },
      },
    },
    timeout: 5000,
  };
}

/**
 * Execute the skill tool to load and return skill content.
 */
export async function executeSkillTool(
  skillName: string,
  workspacePath: string,
  allowedSkills: string[] | null | undefined,
  _sessionId: string,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  // Check if skills are allowed
  const availableSkills = await getAvailableSkills(workspacePath, allowedSkills);
  
  if (availableSkills.length === 0) {
    return {
      success: false,
      error: 'No skills are available for this session.',
    };
  }
  
  // Get the requested skill
  const skill = await getSkill(skillName, workspacePath);
  
  if (!skill) {
    const available = availableSkills.map(s => s.name).join(', ');
    return {
      success: false,
      error: `Skill "${skillName}" not found. Available skills: ${available || 'none'}`,
    };
  }
  
  // Check if this skill is in the allowed list
  const isAllowed = allowedSkills === undefined || 
                    allowedSkills === null || 
                    allowedSkills.includes(skillName);
  
  if (!isAllowed) {
    return {
      success: false,
      error: `Skill "${skillName}" is not available for this session.`,
    };
  }
  
  // Build the skill content output
  const skillDir = skill.location.replace('/SKILL.md', '');
  
  const output = [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    '',
    skill.content,
    '',
    `Base directory for this skill: ${pathToFileURL(skillDir).href}`,
    'Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.',
    '</skill_content>',
  ].join('\n');
  
  return {
    success: true,
    result: {
      title: `Loaded skill: ${skill.name}`,
      output,
    },
  };
}

/**
 * Create an AI SDK Tool object for the skill tool.
 * This is used to integrate with the agent's tool system.
 */
export async function createSkillTool(
  workspacePath: string,
  allowedSkills: string[] | null | undefined,
  sessionId: string,
): Promise<{ name: string; tool: Tool } | null> {
  const definition = await buildSkillToolDefinition(workspacePath, allowedSkills, sessionId);
  
  if (!definition) {
    return null;
  }
  
  // Dynamic import to avoid circular dependencies
  const { tool, jsonSchema } = await import('ai');
  
  return {
    name: 'skill',
    tool: tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: async (args: Record<string, unknown>) => {
        const skillName = args.name as string;
        return executeSkillTool(skillName, workspacePath, allowedSkills, sessionId);
      },
    }),
  };
}
