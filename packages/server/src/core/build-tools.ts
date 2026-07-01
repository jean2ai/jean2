import { tool, jsonSchema, type Tool } from 'ai';
import { getTool, executeTool } from '@/tools';
import { createLlmApi } from '@/tools/llm-api';
import { getUploadDir } from '@/paths';
import { createAskApi, rejectPendingAsksByToolCallId, type AskBroadcastFn } from '@/tools/ask-user-api';
import * as mcp from '@/mcp';
import { interruptManager } from './interrupt';
import { broadcastEvent, type BroadcastFn } from './broadcast';
import { transitionToolToRunningByCallId } from '@/store';
import { executeSubagent, getSubagentToolDefinition, canSpawnSubagent, type SubagentInput, type SubagentOutput } from './subagent';
import { executeWorkflow, getWorkflowToolDefinition } from './workflow';
import type { WorkflowInput, WorkflowResult, PermissionRiskLevel } from '@jean2/sdk';
import { createSkillTool, skillManageToolDefinition, executeSkillManageTool, buildSkillManageToolDescription } from '@/skills';
import { truncateToolResult } from '@/utils/truncate-tool-result';
import { getSession, getWorkspace } from '@/store';
import { memoryToolDefinition, executeMemoryTool } from '@/memory';
import { sessionSearchToolDefinition, executeSessionSearchTool } from '@/session-search';
import { schedulerToolDefinition, executeSchedulerTool } from '@/scheduler/scheduler-tool';
import { getAgentDirectory } from '@/agents/storage';
import { join } from 'path';

export interface BuildToolsOptions {
  toolNames: string[];
  workspacePath: string | undefined;
  workspaceId: string | undefined;
  sessionId: string;
  rootSessionId?: string;
  modelId?: string;
  providerId?: string;
  canSpawnSubagents?: boolean | string[] | null;
  allowedSkills?: string[] | null;
  broadcastFn?: AskBroadcastFn;
  additionalPaths?: string[];
  agentId?: string | null;
}

export async function buildAiSdkTools(
  options: BuildToolsOptions,
  broadcast: BroadcastFn = broadcastEvent,
): Promise<Record<string, Tool>> {
  const {
    toolNames,
    workspacePath,
    workspaceId,
    sessionId,
    rootSessionId: explicitRootSessionId,
    modelId,
    providerId,
    canSpawnSubagents,
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

  const tools: Record<string, Tool> = {};

  const canSpawn = canSpawnSubagents === true
    || (Array.isArray(canSpawnSubagents) && canSpawnSubagents.length > 0);
  const shouldIncludeTask = canSpawnSubagent(sessionId) && !toolNames.includes('task') && canSpawn;
  const allowedSubagentIds = Array.isArray(canSpawnSubagents) ? canSpawnSubagents : undefined;
  const builtInAgentTools = shouldIncludeTask ? ['task'] : [];
  const effectiveToolNames = [...toolNames, ...builtInAgentTools];

  for (const name of effectiveToolNames) {
    if (name === 'task') {
      const subagentDefinition = await getSubagentToolDefinition(allowedSubagentIds);

      tools[name] = tool({
        description: subagentDefinition.description,
        inputSchema: jsonSchema(subagentDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);

          try {
            const subagentInput: SubagentInput = {
              description: args.description as string,
              prompt: args.prompt as string,
              subagent_type: args.subagent_type as string,
              task_id: args.task_id as string | undefined,
              sessionId,
              workspaceId,
              workspacePath,
              abortSignal: toolAbortController.signal,
              onSessionCreated: (childSessionId: string) => {
                const updatedPart = transitionToolToRunningByCallId(sessionId, toolCallId, childSessionId);
                if (updatedPart) {
                  broadcast({ type: 'part.updated', sessionId, part: updatedPart });
                }
              },
              allowedSubagentIds,
              ...(args.outputSchema ? { outputSchema: args.outputSchema as Record<string, unknown> } : {}),
            };

            const result = await executeSubagent(subagentInput);
            return result as SubagentOutput;
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
          }
        },
      });
      continue;
    }

    const loadedTool = await getTool(name);
    if (!loadedTool) continue;

    const { definition } = loadedTool;

    tools[name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
        const toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);

        try {
          const llmFactory = () => createLlmApi(modelId, providerId, sessionId);
          const askFactory = (tcId: string) =>
            broadcastFn
              ? createAskApi(sessionId, tcId, definition.name, broadcastFn, workspaceId, rootSessionId)
              : (() => { throw new Error('Cannot ask user: no broadcast channel available (broadcastFn not provided)'); }) as import('@jean2/sdk').AskApi;

          const result = await executeTool({
            tool: loadedTool,
            args,
            workspacePath,
            sessionId,
            workspaceId,
            allowedPaths: [getUploadDir()],
            additionalPaths: additionalPaths ?? [],
            toolCallId,
            abortSignal: toolAbortController.signal,
            timeout: definition.timeout,
            createLlmApi: llmFactory,
            createAskApi: askFactory,
          });

          if (!result.success) {
            return { error: result.error ?? 'Tool execution failed' };
          }

          const toolOutput = truncateToolResult(result.result, sessionId, name);

          if (result.visualization && toolOutput && typeof toolOutput === 'object') {
            return { ...toolOutput as Record<string, unknown>, _visualization: result.visualization };
          }

          return toolOutput;
        } finally {
          interruptManager.unregisterToolExecution(sessionId, toolCallId);
          // Clean up any pending asks this tool was waiting on (e.g., if the tool
          // timed out while waiting for user permission). Broadcasts ask.timeout
          // so the client removes the permission prompt from the UI.
          rejectPendingAsksByToolCallId(toolCallId);
        }
      },
    });
  }

  // Resolve agent directory and skills dir if this is an agent session
  const agentDir = agentId ? await getAgentDirectory(agentId) : undefined;
  const agentSkillsDir = agentDir ? join(agentDir, 'skills') : undefined;

  if (workspacePath) {
    const skillTool = await createSkillTool(workspacePath, allowedSkills, sessionId, agentSkillsDir);
    if (skillTool) {
      tools[skillTool.name] = skillTool.tool;
    }
  }

  if (workspacePath) {
    try {
      const mcpTools = await mcp.getTools(workspacePath, sessionId);
      Object.assign(tools, mcpTools);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
    }
  }

  // Memory tool (if enabled for this workspace)
  if (workspaceId && workspacePath) {
    const workspace = getWorkspace(workspaceId);
    const memorySettings = workspace?.settings?.memory;
    if (memorySettings?.enabled) {
      const permissionRisk = memorySettings.permissionRisk;
      tools['memory'] = tool({
        description: memoryToolDefinition.description,
        inputSchema: jsonSchema(memoryToolDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const _toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);
          try {
            const askFactory = (tcId: string) =>
              broadcastFn
                ? createAskApi(sessionId, tcId, 'memory', broadcastFn, workspaceId, rootSessionId)
                : undefined as unknown as import('@jean2/sdk').AskApi;
            const askApi = askFactory(toolCallId);

            const result = await executeMemoryTool(
              args,
              join(workspacePath!, '.jean2'),
              permissionRisk,
              async (ask) => askApi(ask),
            );

            if (!result.success) {
              return { error: result.error ?? 'Memory operation failed', ...(result.entries ? { entries: result.entries } : {}), ...(result.usage ? { usage: result.usage } : {}) };
            }

            const r = result.result!;
            return {
              title: r.action === 'list' ? `Memory list (${r.target})` : 'Memory updated',
              ...r,
            };
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
            rejectPendingAsksByToolCallId(toolCallId);
          }
        },
      });
    }

    // Workflow tool (if enabled for this workspace)
    const workflowSettings = workspace?.settings?.workflow;
    if (workflowSettings?.enabled && canSpawn) {
      const workflowDefinition = await getWorkflowToolDefinition(allowedSubagentIds);
      tools['workflow'] = tool({
        description: workflowDefinition.description,
        inputSchema: jsonSchema(workflowDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);
          try {
            const workflowInput = {
              prompt: args.prompt as string,
              ...(args.description ? { description: args.description as string } : {}),
              ...(args.subtasks ? { subtasks: args.subtasks as WorkflowInput['subtasks'] } : {}),
              ...(args.leafPreconfigId ? { leafPreconfigId: args.leafPreconfigId as string } : {}),
              ...(args.outputSchema ? { outputSchema: args.outputSchema as Record<string, unknown> } : {}),
            } as WorkflowInput;

            const result = await executeWorkflow(workflowInput, {
              sessionId,
              workspaceId,
              workspacePath,
              abortSignal: toolAbortController.signal,
              allowedSubagentIds,
            });

            return result as WorkflowResult;
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
          }
        },
      });
    }

    // Skill management tool (if enabled for this workspace)
    const skillSettings = workspace?.settings?.skills;
    if (skillSettings?.managementEnabled) {
      const permissionRisk = skillSettings.permissionRisk;
      const skillManageDescription = await buildSkillManageToolDescription(join(workspacePath!, '.agents', 'skills'));
      tools['skill_manage'] = tool({
        description: skillManageDescription,
        inputSchema: jsonSchema(skillManageToolDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const _toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);
          try {
            const askFactory = (tcId: string) =>
              broadcastFn
                ? createAskApi(sessionId, tcId, 'skill_manage', broadcastFn, workspaceId, rootSessionId)
                : undefined as unknown as import('@jean2/sdk').AskApi;
            const askApi = askFactory(toolCallId);

            const result = await executeSkillManageTool(
              args,
              join(workspacePath!, '.agents', 'skills'),
              permissionRisk,
              async (ask) => askApi(ask),
            );

            if (!result.success) {
              return { error: result.error ?? 'Skill management operation failed' };
            }

            return {
              title: result.title,
              action: result.action,
              name: result.name,
              description: result.description,
              path: result.path,
              summary: result.summary,
              skills: result.skills,
            };
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
            rejectPendingAsksByToolCallId(toolCallId);
          }
        },
      });
    }

    // Session search tool (if enabled for this workspace)
    const sessionSearchSettings = workspace?.settings?.sessionSearch;
    if (sessionSearchSettings?.enabled) {
      const searchPermissionRisk = sessionSearchSettings.permissionRisk;
      const includeToolResults = sessionSearchSettings.includeToolResults;
      tools['session_search'] = tool({
        description: sessionSearchToolDefinition.description,
        inputSchema: jsonSchema(sessionSearchToolDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const _toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);
          try {
            const askFactory = (tcId: string) =>
              broadcastFn
                ? createAskApi(sessionId, tcId, 'session_search', broadcastFn, workspaceId, rootSessionId)
                : undefined as unknown as import('@jean2/sdk').AskApi;
            const askApi = askFactory(toolCallId);

            const result = await executeSessionSearchTool(
              args,
              workspaceId!,
              sessionId,
              includeToolResults,
              searchPermissionRisk,
              async (ask) => askApi(ask),
              agentId,
            );

            if (!result.success) {
              return { error: result.error ?? 'Session search failed' };
            }

            const output = {
              success: result.success,
              mode: result.mode,
              title: result.title,
              ...(result.sessions !== undefined && { sessions: result.sessions }),
              ...(result.query !== undefined && { query: result.query }),
              ...(result.scope !== undefined && { scope: result.scope }),
              ...(result.results !== undefined && { results: result.results }),
              ...(result.sessionId !== undefined && { sessionId: result.sessionId }),
              ...(result.sessionTitle !== undefined && { sessionTitle: result.sessionTitle }),
              ...(result.anchorMessageId !== undefined && { anchorMessageId: result.anchorMessageId }),
              ...(result.anchorInferred !== undefined && { anchorInferred: result.anchorInferred }),
              ...(result.messagesBefore !== undefined && { messagesBefore: result.messagesBefore }),
              ...(result.messagesAfter !== undefined && { messagesAfter: result.messagesAfter }),
              ...(result.messages !== undefined && { messages: result.messages }),
            };

            return output;
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
            rejectPendingAsksByToolCallId(toolCallId);
          }
        },
      });
    }
  }

  // Scheduler tool (if enabled for this workspace)
  if (workspaceId) {
    const ws = getWorkspace(workspaceId);
    const schedulingSettings = ws?.settings?.scheduling;
    if (schedulingSettings?.enabled) {
      const schedulingRisk: PermissionRiskLevel = schedulingSettings.permissionRisk ?? 'none';
      tools['scheduler'] = tool({
        description: schedulerToolDefinition.description,
        inputSchema: jsonSchema(schedulerToolDefinition.inputSchema),
        execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
          const _toolAbortController = interruptManager.registerToolExecution(sessionId, toolCallId);
          let result;
          try {
            const askFactory = (tcId: string) =>
              broadcastFn
                ? createAskApi(sessionId, tcId, 'scheduler', broadcastFn, workspaceId, rootSessionId)
                : undefined as unknown as import('@jean2/sdk').AskApi;
            const askApi = askFactory(toolCallId);

            result = await executeSchedulerTool(
              args,
              workspaceId!,
              sessionId,
              schedulingRisk,
              async (ask) => askApi(ask),
            );
          } finally {
            interruptManager.unregisterToolExecution(sessionId, toolCallId);
            rejectPendingAsksByToolCallId(toolCallId);
          }

          if (!result.success) {
            return { error: result.error ?? 'Scheduler operation failed' };
          }

          return {
            action: result.action,
            title: result.title,
            ...(result.job && { job: result.job }),
            ...(result.jobs && { jobs: result.jobs }),
            ...(result.jobId && { jobId: result.jobId }),
          };
        },
      });
    }
  }

  // Agent-specific tools (auto-included for agent sessions)
  if (agentDir) {
    tools['agent_memory'] = tool({
      description: `Persist your PERSONAL knowledge that travels with you across all workspaces.

Use target="user" for cross-workspace user preferences (how this person likes to work).
Use target="memory" for accumulated work knowledge (lessons, patterns, techniques from any project).

This is YOUR personal memory. It is separate from the workspace memory tool.
- Use "memory" (workspace) for project-specific facts about the current codebase.
- Use "agent_memory" (this tool) for cross-project knowledge that applies everywhere.

Actions:
- list: Read current entries and char usage. Requires target only.
- add: Append a new bullet entry. Requires content.
- replace: Find an entry by oldText substring and replace it.
- remove: Find an entry by oldText substring and remove it.

Character limits: user=1500, memory=2500. Keep entries compact.`,
      inputSchema: jsonSchema(memoryToolDefinition.inputSchema),
      execute: async (args: Record<string, unknown>) => {
        const result = await executeMemoryTool(args, agentDir, 'none');
        if (!result.success) {
          return { error: result.error ?? 'Agent memory operation failed' };
        }
        const r = result.result!;
        return {
          title: r.action === 'list' ? `Agent memory list (${r.target})` : 'Agent memory updated',
          ...r,
        };
      },
    });

    const agentSkillsManageDir = join(agentDir, 'skills');
    const agentSkillManageDescription = await buildSkillManageToolDescription(agentSkillsManageDir);
    tools['agent_skill_manage'] = tool({
      description: agentSkillManageDescription,
      inputSchema: jsonSchema(skillManageToolDefinition.inputSchema),
      execute: async (args: Record<string, unknown>) => {
        const result = await executeSkillManageTool(args, agentSkillsManageDir, 'none');
        if (!result.success) {
          return { error: result.error ?? 'Agent skill management failed' };
        }
        return {
          title: result.title,
          action: result.action,
          name: result.name,
          description: result.description,
          path: result.path,
          summary: result.summary,
          skills: result.skills,
        };
      },
    });
  }

  return tools;
}
