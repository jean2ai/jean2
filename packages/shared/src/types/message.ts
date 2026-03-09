// Content blocks (ACP-lite)
import type { PermissionType } from './permission';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  pending?: boolean;
  needsApproval?: boolean;
  dangerous?: boolean;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ImageBlock {
  type: 'image';
  url: string;
  mimeType?: string;
}

export interface PermissionRequestBlock {
  type: 'permission_request';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: PermissionType;
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock | ImageBlock | PermissionRequestBlock;

// Message
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[];
  createdAt: string;
}
