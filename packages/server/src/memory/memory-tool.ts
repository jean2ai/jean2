import type { PermissionRiskLevel, PermissionAsk } from '@jean2/sdk';
import { addEntry, replaceEntry, removeEntry, listEntries, type MemoryTarget, type MemoryActionResult } from './registry';

export const memoryToolDefinition = {
  name: 'memory',
  description: `Persist durable workspace knowledge across sessions.

Use target="user" for user preferences and communication/workflow expectations.
Use target="memory" for workspace facts, repo conventions, commands, lessons, and non-obvious fixes.

Character limits: user=${1500} chars, workspace=${2500} chars. Keep entries compact.

Actions:
- list: Read current entries and char usage for a target. Requires target only.
- add: Append a new bullet entry. Requires content.
- replace: Find an entry by oldText substring and replace it. Requires oldText and content.
- remove: Find an entry by oldText substring and remove it. Requires oldText.

Use list before replace/remove to see the exact current entries and avoid guesswork.
Only save compact facts that should affect future sessions.
Do not save secrets, raw logs, large code, or one-off details.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['list', 'add', 'replace', 'remove'],
        description: 'The action to perform on the memory file.',
      },
      target: {
        type: 'string' as const,
        enum: ['user', 'memory'],
        description: 'Which memory file to modify. "user" for preferences, "memory" for workspace facts.',
      },
      content: {
        type: 'string' as const,
        description: 'The new content for add/replace actions.',
      },
      oldText: {
        type: 'string' as const,
        description: 'The text to find for replace/remove actions. Must match exactly one entry.',
      },
    },
    required: ['action', 'target'],
  },
  timeout: 10000,
};

export interface MemoryToolInput {
  action: 'list' | 'add' | 'replace' | 'remove';
  target: MemoryTarget;
  content?: string;
  oldText?: string;
}

export async function executeMemoryTool(
  input: Record<string, unknown>,
  workspacePath: string,
  permissionRisk: PermissionRiskLevel,
  askFn?: (ask: PermissionAsk) => Promise<unknown>,
): Promise<MemoryActionResult> {
  const action = input.action as MemoryToolInput['action'];
  const target = input.target as MemoryToolInput['target'];
  const content = input.content as string | undefined;
  const oldText = input.oldText as string | undefined;

  if (!action || !['list', 'add', 'replace', 'remove'].includes(action)) {
    return { success: false, error: 'Invalid action. Must be list, add, replace, or remove.' };
  }

  if (!target || !['user', 'memory'].includes(target)) {
    return { success: false, error: 'Invalid target. Must be user or memory.' };
  }

  // `list` is read-only and doesn't need permission
  if (action === 'list') {
    return listEntries(workspacePath, target);
  }

  // Request permission if a risk level is set and askFn is available
  if (permissionRisk !== 'none' && askFn) {
    const ask: PermissionAsk = {
      type: 'permission',
      question: `Allow memory ${action} on ${target}?`,
      description: `Action: ${action}\nTarget: ${target}${content ? `\nContent: ${content.slice(0, 200)}` : ''}${oldText ? `\nOld text: ${oldText.slice(0, 200)}` : ''}`,
      risk: permissionRisk,
      resource: 'file',
      action: 'write',
      paths: [`.jean2/${target === 'user' ? 'USER.md' : 'MEMORY.md'}`],
    };
    const approved = await askFn(ask);
    if (!approved) {
      return { success: false, error: 'USER_REJECTION' };
    }
  }

  switch (action) {
    case 'add': {
      if (!content) {
        return { success: false, error: 'Content is required for add action.' };
      }
      return addEntry(workspacePath, target, content);
    }
    case 'replace': {
      if (!oldText) {
        return { success: false, error: 'oldText is required for replace action.' };
      }
      if (!content) {
        return { success: false, error: 'Content is required for replace action.' };
      }
      return replaceEntry(workspacePath, target, oldText, content);
    }
    case 'remove': {
      if (!oldText) {
        return { success: false, error: 'oldText is required for remove action.' };
      }
      return removeEntry(workspacePath, target, oldText);
    }
  }
}
