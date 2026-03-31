import { dynamicTool, jsonSchema, type Tool, type JSONSchema7 } from 'ai';
import { CallToolResultSchema, type Tool as MCPToolDef } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';

const MAX_OUTPUT_CHARS = 50_000;
const JEAN2_TEMP_PREFIX = path.join(os.tmpdir(), 'jean2', '');

type TextContent = { type: 'text'; text: string };
type ImageContent = { type: 'image'; data: string; mimeType: string };
type AudioContent = { type: 'audio'; data: string; mimeType: string };
type ResourceLinkContent = { type: 'resource_link'; uri: string; name: string };
type ResourceContent = { type: 'resource'; resource: { uri: string; text?: string; blob?: string } };
type ContentItem = TextContent | ImageContent | AudioContent | ResourceLinkContent | ResourceContent;

type McpToolResult = {
  content: ContentItem[];
  isError?: boolean;
};

export async function convertMcpTool(
  mcpTool: MCPToolDef,
  client: Client,
  serverName: string,
  timeout?: number,
  sessionId?: string,
): Promise<Tool> {
  const inputSchema = mcpTool.inputSchema;
  const schema: JSONSchema7 = {
    ...(inputSchema as JSONSchema7),
    type: 'object',
    properties: (inputSchema.properties ?? {}) as JSONSchema7['properties'],
    additionalProperties: false,
  };

  const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedToolName = mcpTool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const _toolName = `${sanitizedServerName}_${sanitizedToolName}`;

  return dynamicTool({
    description: mcpTool.description ?? `MCP tool from ${serverName}`,
    inputSchema: jsonSchema(schema),
    execute: async (args: unknown) => {
      const result = await client.callTool(
        {
          name: mcpTool.name,
          arguments: (args || {}) as Record<string, unknown>,
        },
        CallToolResultSchema,
        {
          resetTimeoutOnProgress: true,
          timeout,
        },
      ) as McpToolResult;

      const fullOutput = JSON.stringify(result);

      if (fullOutput.length > MAX_OUTPUT_CHARS && sessionId) {
        const dir = `${JEAN2_TEMP_PREFIX}${sessionId}`;
        mkdirSync(dir, { recursive: true });

        const filePath = `${dir}/mcp-${sanitizedServerName}-${sanitizedToolName}-${Date.now()}.json`;
        writeFileSync(filePath, fullOutput);

        const textEntries = result.content?.filter((entry): entry is TextContent => entry.type === 'text') ?? [];
        let previewText = '';

        if (textEntries.length > 0) {
          previewText = textEntries[0].text.slice(0, 2000);
        }

        const note = `\n\n[Result persisted to ${filePath} - full output was ${fullOutput.length} characters. Use read-file tool to read the persisted result if needed.]`;

        return {
          ...result,
          content: [
            {
              type: 'text' as const,
              text: previewText + note,
            },
          ],
          _persisted: true,
          _filePath: filePath,
          _originalSize: fullOutput.length,
        };
      }

      return result;
    },
  });
}

export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
