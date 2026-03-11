import type { ToolDefinition, TextPart } from '@jean2/shared';
import { getPreconfig, listSubagentPreconfigs } from './preconfig';
import { createSession, getSession } from '@/store';
import { executeChildSession } from './agent';
import { getModelsConfig, findModel } from '@/config';
import { randomUUID } from 'crypto';

/**
 * Determine provider from model ID (fallback logic)
 */
function findProviderFromModel(m: string): string {
  const modelInfo = findModel(m);
  if (modelInfo) return modelInfo.providerId;
  // Fallback parsing
  if (m.includes('/')) return 'openrouter';
  if (m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('gemini-')) return 'google';
  return 'openai';
}

const MAX_SUBAGENT_DEPTH = 2;

/**
 * Compute session depth by walking up the parent chain.
 * Primary session (no parent) = depth 0
 * Child of primary = depth 1
 * Child of child = depth 2
 */
function computeSessionDepth(sessionId: string): number {
  let depth = 0;
  let currentSession = getSession(sessionId);

  while (currentSession?.parentId) {
    depth++;
    currentSession = getSession(currentSession.parentId);
  }

  return depth;
}

export function canSpawnSubagent(sessionId: string): boolean {
  const depth = computeSessionDepth(sessionId);
  return depth < MAX_SUBAGENT_DEPTH;
}

export interface SubagentInput {
  description: string;
  prompt: string;
  subagent_type: string;
  task_id?: string;
  sessionId: string;
  workspaceId?: string;
  workspacePath?: string;
}

export interface SubagentOutput {
  task_id: string;
  result: string;
  error?: string;
}

export async function getSubagentToolDefinition(): Promise<ToolDefinition> {
  const subagents = await listSubagentPreconfigs();

  const agentList = subagents
    .map((a) => `- ${a.id}: ${a.description ?? 'This subagent should only be called manually by the user.'}`)
    .join('\n');

  return {
    name: 'task',
    description: `Launch a new agent to handle complex, multistep tasks autonomously.

Available agent types and the tools they have access to:
${agentList}

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance
2. The agent's outputs should generally be trusted
3. Each agent invocation starts with a fresh context unless you provide task_id to resume the same subagent session (which continues with its previous messages and tool outputs). When starting fresh, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches), since it is not aware of the user's intent. Tell it how to verify its work if possible (e.g., relevant test commands).
5. If the agent description mentions that it should be proactively used, then you should try your best to use it without the user having to ask you to do so first. Use your judgement.

Note: Subagent depth is limited to 2 levels. You cannot spawn further subagents at the maximum depth.`,
    script: 'internal',
    runtime: 'bun',
    timeout: 300000,
    requireApproval: false,
    dangerous: false,
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A short (3-5 words) description of the task',
        },
        prompt: {
          type: 'string',
          description:
            'The task for the agent to perform. Should contain a highly detailed task description specifying exactly what information the agent should return in its final message',
        },
        subagent_type: {
          type: 'string',
          description: 'The type of specialized agent to use for this agent',
        },
        task_id: {
          type: 'string',
          description:
            'Set this to resume a previous subagent session (continues with its previous messages and tool outputs)',
        },
      },
      required: ['description', 'prompt', 'subagent_type'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        result: { type: 'string' },
        error: { type: 'string' },
      },
    },
  };
}

export async function executeSubagent(input: SubagentInput): Promise<SubagentOutput> {
  const { description, prompt, subagent_type, task_id, sessionId, workspaceId, workspacePath } = input;

  // Get parent session for model inheritance
  const parentSession = getSession(sessionId);

  // Resolve parent's actual model using same fallback chain as main chat:
  // session > parent preconfig > config default
  const parentPreconfig = parentSession?.preconfigId
    ? await getPreconfig(parentSession.preconfigId)
    : null;
  const config = getModelsConfig();

  const parentModelId = parentSession?.selectedModel
    || parentPreconfig?.model
    || config.defaultModel;
  const parentProviderId = parentSession?.selectedProvider
    || (parentPreconfig?.model ? findProviderFromModel(parentPreconfig.model) : null)
    || config.defaultProvider;

  // Check depth limit
  const currentDepth = computeSessionDepth(sessionId);
  if (currentDepth >= MAX_SUBAGENT_DEPTH) {
    return {
      task_id: '',
      result: '',
      error: `Maximum subagent depth (${MAX_SUBAGENT_DEPTH}) reached. Cannot spawn more subagents.`,
    };
  }

  try {
    const subagentPreconfig = await getPreconfig(subagent_type);
    if (!subagentPreconfig) {
      const available = await listSubagentPreconfigs();
      const availableNames = available.map((s) => s.id).join(', ');
      return {
        task_id: '',
        result: '',
        error: `Unknown subagent type: "${subagent_type}". Available subagents: ${availableNames || 'none'}`,
      };
    }

    let childSession;
    let resumeFromHistory = false;

    if (task_id) {
      childSession = getSession(task_id);
      if (!childSession) {
        childSession = null;
      } else if (childSession.parentId !== sessionId) {
        return {
          task_id: '',
          result: '',
          error: 'Invalid task_id: does not belong to this session',
        };
      } else {
        resumeFromHistory = true;
      }
    }

    if (!childSession) {
      childSession = createSession({
        id: randomUUID(),
        workspaceId: workspaceId || '',
        preconfigId: subagent_type,
        title: `${description} (@${subagent_type} subagent)`,
        status: 'active',
        metadata: null,
        parentId: sessionId,
        agentName: subagent_type,
      });
    }

    const result = await executeChildSession({
      parentSessionId: sessionId,
      childSessionId: childSession.id,
      preconfig: subagentPreconfig,
      prompt,
      workspacePath,
      workspaceId,
      resumeFromHistory,
      // Inherit model from parent if preconfig doesn't specify one
      modelId: subagentPreconfig.model !== null
        ? subagentPreconfig.model
        : parentModelId,
      providerId: subagentPreconfig.provider !== null
        ? subagentPreconfig.provider
        : parentProviderId,
    });

    // Extract ONLY the last text part - matching OpenCode behavior
    // Note: executeChildSession now returns parts instead of content
    const text = result.parts
      .filter((part): part is TextPart => part.type === 'text')
      .map((part) => part.text || '')
      .pop() ?? '';

    // If there's an error and no text, return it directly
    if (result.error && !text) {
      return {
        task_id: childSession.id,
        result: '',
        error: result.error,
      };
    }

    // Format output like OpenCode with task_result tags
    const output = [
      `task_id: ${childSession.id} (for resuming to continue this task if needed)`,
      '',
      '<task_result>',
      text || 'No response generated',
      '</task_result>',
    ].join('\n');

    return {
      task_id: childSession.id,
      result: output,
      ...(result.error && { error: result.error }),
    };
  } catch (err) {
    return {
      task_id: '',
      result: '',
      error: `Task tool error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
