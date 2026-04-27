import { homedir } from 'os';
import { join } from 'path';
import { tool, jsonSchema, type Tool } from 'ai';
import type { ToolExecutionContext } from '@jean2/sdk';
import { getTool, executeTool, executeToolWithSecurity, hasSecurityCheck } from '@/tools';
import type { PermissionRequestCallback } from '@/tools';
import { createLlmApi } from '@/tools/llm-api';
import { createAskUserApi, type AskUserBroadcastFn } from '@/tools/ask-user-api';
import * as mcp from '@/mcp';
import { interruptManager } from './interrupt';
import { transitionToolToRunningByCallId } from '@/store';
import { executeSubagent, getSubagentToolDefinition, canSpawnSubagent, type SubagentInput, type SubagentOutput } from './subagent';
import { createSkillTool } from '@/skills';
import { truncateToolResult } from '@/utils/truncate-tool-result';

export interface BuildToolsOptions {
  toolNames: string[];
  workspacePath: string | undefined;
  workspaceId: string | undefined;
  sessionId: string;
  modelId?: string;
  providerId?: string;
  onPermissionRequest?: PermissionRequestCallback;
  canSpawnSubagents?: boolean | string[] | null;
  allowedSkills?: string[] | null;
  broadcastFn?: AskUserBroadcastFn;
}

export async function buildAiSdkTools(
  options: BuildToolsOptions
): Promise<Record<string, Tool>> {
  const {
    toolNames,
    workspacePath,
    workspaceId,
    sessionId,
    modelId,
    providerId,
    onPermissionRequest,
    canSpawnSubagents,
    allowedSkills,
    broadcastFn,
  } = options;

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
                transitionToolToRunningByCallId(sessionId, toolCallId, childSessionId);
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
          const context: ToolExecutionContext = {
            workspacePath,
            sessionId,
            workspaceId,
            allowedPaths: [join(homedir(), '.jean2', 'data', 'upload')],
          };

          const llmFactory = () => createLlmApi(modelId, providerId);
          const askUserFactory = (tcId: string) =>
            broadcastFn
              ? createAskUserApi(sessionId, tcId, definition.name, broadcastFn)
              : ({} as import('@jean2/sdk').AskUserApi);

          if (hasSecurityCheck(loadedTool)) {
            const result = await executeToolWithSecurity({
              tool: loadedTool,
              args,
              context,
              toolCallId,
              onPermissionRequest,
              abortSignal: toolAbortController.signal,
              timeout: definition.timeout,
              createLlmApi: llmFactory,
              createAskUserApi: askUserFactory,
            });

            if (!result.success) {
              if (result.error === 'USER_REJECTION' || result.permissionGranted === false) {
                return {
                  error: 'USER_REJECTION',
                  message: `The user denied permission to execute this tool (${name}). Do NOT retry this tool call.`,
                  toolName: name,
                  args,
                };
              }
              return { error: result.error };
            }

            return truncateToolResult(result.result, sessionId, name);
          }

          const execResult = await executeTool({
            tool: loadedTool,
            args,
            workspacePath,
            sessionId,
            toolCallId,
            abortSignal: toolAbortController.signal,
            timeout: definition.timeout,
            createLlmApi: llmFactory,
            createAskUserApi: askUserFactory,
          });

          if (!execResult.success) {
            return { error: execResult.error };
          }

          return truncateToolResult(execResult.result, sessionId, name);
        } finally {
          interruptManager.unregisterToolExecution(sessionId, toolCallId);
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

  return tools;
}