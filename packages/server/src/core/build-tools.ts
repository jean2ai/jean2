import * as mcp from '@/mcp';
import { broadcastEvent, type BroadcastFn } from './broadcast';
import { getAgentDirectory } from '@/agents/storage';
import { getSession } from '@/store';
import { join } from 'path';
import { buildExternalTools } from './tool-builders/external-tools';
import { buildWorkspaceTools } from './tool-builders/workspace-tools';
import { buildAgentTools } from './tool-builders/agent-tools';
import { resolveToolExecutionScopes } from './tool-capabilities';
import { wrapToolsWithOutputProcessing } from './tool-output/wrap-tools';
import { buildRetrieveToolOutputTool } from './tool-output/retrieval-tool';
import type { ToolMap } from './tool-builders/types';

export interface BuildToolsOptions {
  toolNames: string[];
  workspacePath: string | undefined;
  workspaceId: string | undefined;
  sessionId: string;
  rootSessionId?: string;
  modelId?: string;
  providerId?: string;
  canSpawnSubagents?: boolean | string[] | null;
  allowSelfAsSubagent?: boolean;
  allowedSkills?: string[] | null;
  broadcastFn?: import('@/tools/ask-user-api').AskBroadcastFn;
  additionalPaths?: string[];
  agentId?: string | null;
}

export async function buildAiSdkTools(
  options: BuildToolsOptions,
  broadcast: BroadcastFn = broadcastEvent,
): Promise<Record<string, import('ai').Tool>> {
  const {
    toolNames,
    workspacePath,
    workspaceId,
    sessionId,
    rootSessionId: explicitRootSessionId,
    modelId,
    providerId,
    canSpawnSubagents,
    allowSelfAsSubagent,
    allowedSkills,
    broadcastFn,
    additionalPaths,
    agentId,
  } = options;

  // Resolve root session ID by walking up the parent chain
  const rootSessionId = explicitRootSessionId ?? (() => {
    let current = sessionId;
    let session = getSession(current);
    while (session?.parentId) {
      current = session.parentId;
      session = getSession(current);
    }
    return current;
  })();

  // Resolve execution scopes for capability filtering (separate from ask-routing root)
  const executionScopes = resolveToolExecutionScopes(sessionId);

  const canSpawn = canSpawnSubagents === true
    || (Array.isArray(canSpawnSubagents) && canSpawnSubagents.length > 0);
  const allowedSubagentIds = Array.isArray(canSpawnSubagents) ? canSpawnSubagents : undefined;

  // Resolve agent directory for skills
  const agentDir = agentId ? await getAgentDirectory(agentId) : undefined;
  const agentSkillsDir = agentDir ? join(agentDir, 'skills') : undefined;

  // Phase 1: External tools (task subagent + registry tools)
  const externalTools = await buildExternalTools({
    toolNames,
    canSpawnSubagents,
    allowSelfAsSubagent,
    broadcastFn,
    broadcast,
    sessionId,
    workspaceId,
    workspacePath,
    rootSessionId,
    executionScopes,
    modelId,
    providerId,
    additionalPaths,
  });
  const tools: ToolMap = { ...externalTools };

  // Phase 2: Workspace-gated tools (memory, workflow, skills, search, scheduler)
  if (workspaceId && workspacePath) {
    const workspaceTools = await buildWorkspaceTools({
      workspaceId,
      workspacePath,
      rootSessionId,
      sessionId,
      canSpawn,
      canSpawnSubagents,
      allowSelfAsSubagent,
      allowedSubagentIds,
      broadcastFn,
      agentId,
      allowedSkills,
      agentSkillsDir,
    });
    Object.assign(tools, workspaceTools);

    // Phase 3: MCP tools
    try {
      const mcpTools = await mcp.getTools(workspacePath, sessionId);
      Object.assign(tools, mcpTools);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
    }
  }

  // Phase 4: Agent-specific tools (agent_memory, agent_skill_manage)
  if (agentDir) {
    const agentTools = await buildAgentTools({ agentDir });
    Object.assign(tools, agentTools);
  }

  // Phase 5: Built-in retrieval tool — always present so oversized tool outputs remain retrievable.
  tools.retrieve_tool_output = buildRetrieveToolOutputTool({ sessionId });

  // Phase 6: Central output processing wrapper applies to every other tool source.
  const wrapped = wrapToolsWithOutputProcessing(tools as Record<string, import('ai').Tool<unknown, unknown>>, { sessionId });
  return wrapped as unknown as ToolMap;
}
