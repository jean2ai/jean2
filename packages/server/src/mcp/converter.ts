import { dynamicTool, jsonSchema, type Tool, type JSONSchema7 } from 'ai';
import { CallToolResultSchema, type Tool as MCPToolDef } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Convert an MCP tool definition to an AI SDK Tool.
 * The returned tool will call the MCP client when executed.
 */
export async function convertMcpTool(
  mcpTool: MCPToolDef,
  client: Client,
  serverName: string,
  timeout?: number,
): Promise<Tool> {
  // Convert inputSchema to JSONSchema7 format
  const inputSchema = mcpTool.inputSchema;
  const schema: JSONSchema7 = {
    ...(inputSchema as JSONSchema7),
    type: 'object',
    properties: (inputSchema.properties ?? {}) as JSONSchema7['properties'],
    additionalProperties: false,
  };

  // Sanitize tool name: servername_toolname format
  const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedToolName = mcpTool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const _toolName = `${sanitizedServerName}_${sanitizedToolName}`;

  return dynamicTool({
    description: mcpTool.description ?? `MCP tool from ${serverName}`,
    inputSchema: jsonSchema(schema),
    execute: async (args: unknown) => {
      return client.callTool(
        {
          name: mcpTool.name,
          arguments: (args || {}) as Record<string, unknown>,
        },
        CallToolResultSchema,
        {
          resetTimeoutOnProgress: true,
          timeout,
        },
      );
    },
  });
}

/**
 * Sanitize a name for use as a tool identifier.
 */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
