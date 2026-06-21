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
import { createSkillTool, skillManageToolDefinition, executeSkillManageTool, buildSkillManageToolDescription } from '@/skills';
import { truncateToolResult } from '@/utils/truncate-tool-result';
import { getSession, getWorkspace } from '@/store';
import { memoryToolDefinition, executeMemoryTool } from '@/memory';
import { sessionSearchToolDefinition, executeSessionSearchTool } from '@/session-search';

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
  const effectiveToolNames = shouldIncludeTask ? [...toolNames, 'task'] : toolNames;

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

  if (workspacePath) {
    const skillTool = await createSkillTool(workspacePath, allowedSkills, sessionId);
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
              workspacePath!,
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

    // Skill management tool (if enabled for this workspace)
    const skillSettings = workspace?.settings?.skills;
    if (skillSettings?.managementEnabled) {
      const permissionRisk = skillSettings.permissionRisk;
      const skillManageDescription = await buildSkillManageToolDescription(workspacePath!);
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
              workspacePath!,
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

  return tools;
}
