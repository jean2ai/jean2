import type { PermissionType } from './permission';

// ===========================================
// Tool State Types
// ===========================================

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'interrupted';

interface ToolStateBase {
  input: Record<string, unknown>;
}

export interface ToolStatePending extends ToolStateBase {
  status: 'pending';
}

export interface ToolStateRunning extends ToolStateBase {
  status: 'running';
  startedAt: number; // Unix timestamp in ms
  childSessionId?: string; // For 'task' tool: ID of the child/subagent session
}

export interface ToolStateCompleted extends ToolStateBase {
  status: 'completed';
  output: unknown;
  startedAt: number;
  completedAt: number;
  childSessionId?: string; // For 'task' tool: ID of the child/subagent session
}

export interface ToolStateError extends ToolStateBase {
  status: 'error';
  error: string;
  startedAt: number;
  failedAt: number;
}

export interface ToolStateInterrupted extends ToolStateBase {
  status: 'interrupted';
  input: Record<string, unknown>;
  startedAt: number;
  interruptedAt: number;
  reason: 'user_request' | 'timeout' | 'error' | 'cascade';
  partialOutput?: unknown; // Save partial results for potential resumption
  childSessionId?: string; // For 'task' tool: ID of the child/subagent session
}

export type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError
  | ToolStateInterrupted;

// ===========================================
// Part Types
// ===========================================

interface PartBase {
  id: string;
  messageId: string;
  createdAt: number; // Unix timestamp in ms
}

export interface TextPart extends PartBase {
  type: 'text';
  text: string;
}

export interface ReasoningPart extends PartBase {
  type: 'reasoning';
  text: string;
}

export interface ToolPart extends PartBase {
  type: 'tool';
  callId: string; // Maps to AI SDK's toolCallId
  name: string; // Tool name (e.g., 'bash', 'read', 'write')
  state: ToolState;
}

export interface FilePart extends PartBase {
  type: 'file';
  mimeType: string;
  filename?: string;
  url: string; // Data URL or file path
}

export interface ImagePart extends PartBase {
  type: 'image';
  url: string;
  mimeType?: string;
}

export interface StepPart extends PartBase {
  type: 'step';
  number: number;
  status: 'started' | 'finished';
  // Only populated when status === 'finished':
  finishReason?: 'stop' | 'tool-calls' | 'error' | 'length';
  snapshot?: string; // JSON stringified conversation state for revert
  tokens?: {
    prompt: number;
    completion: number;
  };
  cost?: number;
}

export interface CompactionPart extends PartBase {
  type: 'compaction';
  summary: string; // LLM-generated summary
  compactedMessageIds: string[]; // IDs of messages that were summarized
}

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FilePart
  | ImagePart
  | StepPart
  | CompactionPart;

// ===========================================
// Message Types
// ===========================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type AssistantStatus = 'streaming' | 'completed' | 'error';

interface MessageBase {
  id: string;
  sessionId: string;
  role: MessageRole;
  createdAt: number; // Unix timestamp in ms
}

export interface UserMessage extends MessageBase {
  role: 'user';
}

export interface SystemMessage extends MessageBase {
  role: 'system';
}

export interface AssistantMessage extends MessageBase {
  role: 'assistant';
  status: AssistantStatus;
  modelId: string;
  providerId: string;
  agent?: string;
  tokens: {
    prompt: number;
    completion: number;
  };
  cost: number;
  completedAt?: number;
  error?: string;
}

export type Message = UserMessage | AssistantMessage | SystemMessage;

// ===========================================
// Combined Types
// ===========================================

export interface MessageWithParts {
  message: Message;
  parts: Part[];
}

// ===========================================
// WebSocket Event Types
// ===========================================

export type PartField = 'text';

export type MessageEvent =
  // Message lifecycle
  | { type: 'message.created'; message: Message }
  | { type: 'message.updated'; message: Message }
  // Part lifecycle
  | { type: 'part.created'; sessionId: string; part: Part }
  | { type: 'part.updated'; sessionId: string; part: Part }
  | { type: 'part.append'; sessionId: string; partId: string; field: PartField; delta: string };

// ===========================================
// Legacy Type (kept for security flow)
// ===========================================

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

// ===========================================
// Type Guards
// ===========================================

export function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === 'tool';
}

export function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === 'reasoning';
}

export function isStepPart(part: Part): part is StepPart {
  return part.type === 'step';
}

export function isCompactionPart(part: Part): part is CompactionPart {
  return part.type === 'compaction';
}

export function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === 'assistant';
}

export function isUserMessage(message: Message): message is UserMessage {
  return message.role === 'user';
}
