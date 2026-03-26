import { tool, jsonSchema, type Tool } from 'ai';
import type { ToolExecutionContext } from '@jean2/shared';
import { getTool, executeTool, executeToolWithSecurity, hasSecurityCheck } from '@/tools';
import type { PermissionRequestCallback } from '@/tools';
import * as mcp from '@/mcp';
import { interruptManager } from './interrupt';
import { transitionToolToRunningByCallId } from '@/store';
import { executeSubagent, getSubagentToolDefinition, canSpawnSubagent, type SubagentInput, type SubagentOutput } from './subagent';
import { createSkillTool } from '@/skills';

export async function buildAiSdkTools(
  toolNames: string[],
  workspacePath: string | undefined,
  workspaceId: string | undefined,
  sessionId: string,
  onPermissionRequest?: PermissionRequestCallback,
  canSpawnSubagents?: boolean,
  allowedSkills?: string[] | null
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  const shouldIncludeTask = canSpawnSubagent(sessionId) && !toolNames.includes('task') && (canSpawnSubagents !== false);
  const effectiveToolNames = shouldIncludeTask ? [...toolNames, 'task'] : toolNames;

  for (const name of effectiveToolNames) {
    if (name === 'task') {
      const subagentDefinition = await getSubagentToolDefinition();

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

    const discoveredTool = await getTool(name);
    if (!discoveredTool) continue;

    const { definition } = discoveredTool;

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
          };

          if (hasSecurityCheck(discoveredTool)) {
            const result = await executeToolWithSecurity({
              tool: discoveredTool,
              args,
              context,
              toolCallId,
              onPermissionRequest,
              abortSignal: toolAbortController.signal,
            });

            if (!result.success) {
              if (result.error === 'USER_REJECTION' || result.permissionGranted === false) {
                return {
                  error: 'USER_REJECTION',
                  message: `The user denied permission to execute this tool (${name}). ` +
                           `Do NOT retry this tool call. Acknowledge this rejection and ask what they would like to do instead.`,
                  toolName: name,
                  args,
                };
              }

              if (result.interrupted) {
                return {
                  error: 'INTERRUPTED',
                  message: `Tool execution was interrupted`,
                  toolName: name,
                  args,
                  partialOutput: result.partialOutput,
                };
              }

              return { error: result.error };
            }

            return result.result;
          }

          const execResult = await executeTool({
            tool: discoveredTool,
            args,
            workspacePath,
            sessionId,
            toolCallId,
            abortSignal: toolAbortController.signal,
          });

          if (!execResult.success) {
            if (execResult.interrupted) {
              return {
                error: 'INTERRUPTED',
                message: `Tool execution was interrupted`,
                toolName: name,
                args,
                partialOutput: execResult.partialOutput,
              };
            }
            return { error: execResult.error };
          }

          return execResult.result;
        } finally {
          interruptManager.unregisterToolExecution(sessionId, toolCallId);
        }
      },
    });
  }

  if (workspacePath) {
    const skillTool = await createSkillTool(workspacePath, allowedSkills);
    if (skillTool) {
      tools[skillTool.name] = skillTool.tool;
    }
  }

  if (workspacePath) {
    try {
      const mcpTools = await mcp.getTools(workspacePath);
      Object.assign(tools, mcpTools);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
    }
  }

  return tools;
}
