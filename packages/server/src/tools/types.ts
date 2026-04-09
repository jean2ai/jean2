import type { ToolDefinition, ToolRuntime } from '@jean2/sdk';

export type { ToolDefinition, ToolRuntime };

export interface DiscoveredTool {
  definition: ToolDefinition;
  path: string;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  interrupted?: boolean;
  partialOutput?: string;
}
