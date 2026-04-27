import type { AnyVisualization } from './visualization';

export type BufferEncoding = 'utf-8' | 'ascii' | 'utf-16le' | 'ucs2' | 'base64' | 'hex' | 'latin1' | 'binary';

// ===========================================
// Tool Definition (new module format)
// ===========================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  timeout?: number;
  requireApproval?: boolean;
  dangerous?: boolean;
  env?: string[];
}

// ===========================================
// Tool Result
// ===========================================

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  visualization?: AnyVisualization;
  interrupted?: boolean;
  partialOutput?: string;
}

// ===========================================
// Tool Execution Context (for tool execution)
// ===========================================

export interface ToolExecutionContext {
  workspacePath?: string;
  sessionId: string;
  workspaceId?: string;
  allowedPaths?: string[];
}

// ===========================================
// Tool Module (what a tool.ts exports)
// ===========================================

export interface ToolModule {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// ===========================================
// Tool Context (full capabilities)
// ===========================================

export interface ToolContext {
  sessionId: string;
  workspacePath: string;
  workspaceId?: string;
  abortSignal: AbortSignal;
  allowedPaths: string[];

  fs: FileSystemApi;
  llm: LlmApi;
  ask: AskApi;
  env: EnvApi;
  logger: ToolLogger;
  fetch: typeof globalThis.fetch;

  resolvePath(path: string): string;
  isWithinWorkspace(path: string): boolean;
  isSensitivePath(path: string): boolean;
  isBlockedPath(path: string): boolean;
}

// ===========================================
// FileSystem API
// ===========================================

export interface FileSystemApi {
  readFile(path: string): Promise<Uint8Array>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  appendFile(path: string, data: string | Uint8Array): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;

  resolve(path: string): string;
  detectLanguage(path: string): string;

  tempDir: string;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modifiedAt: Date;
  createdAt: Date;
}

// ===========================================
// LLM API
// ===========================================

export interface LlmApi {
  generateText(options: LlmTextOptions): Promise<string>;
  generateStructured<T = unknown>(options: LlmStructuredOptions): Promise<T>;
}

export interface LlmTextOptions {
  prompt: string;
  system?: string;
  model?: string;
  image?: LlmImage | LlmImage[];
  maxTokens?: number;
}

export interface LlmStructuredOptions extends Omit<LlmTextOptions, never> {
  prompt: string;
  system?: string;
  model?: string;
  image?: LlmImage | LlmImage[];
  maxTokens?: number;
  schema: Record<string, unknown>;
}

export interface LlmImage {
  data: Uint8Array | string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

// ===========================================
// Ask API (bidirectional tool ↔ client communication)
// ===========================================

// Who should handle this ask
export type AskTarget = 'human' | 'client' | 'permission';

// --- Human question types ---

export interface SingleSelectQuestion {
  type: 'single_select';
  question: string;
  description?: string;
  options: Array<{ label: string; value: string; description?: string }>;
}

export interface MultiSelectQuestion {
  type: 'multi_select';
  question: string;
  description?: string;
  options: Array<{ label: string; value: string; description?: string }>;
  min?: number;
  max?: number;
}

export interface TextQuestion {
  type: 'text';
  question: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
}

export interface ConfirmQuestion {
  type: 'confirm';
  question: string;
  description?: string;
  defaultValue?: boolean;
}

export type HumanQuestion = SingleSelectQuestion | MultiSelectQuestion | TextQuestion | ConfirmQuestion;

// --- Form question (multiple sub-questions) ---

export interface FormQuestion {
  type: 'form';
  question: string;
  description?: string;
  questions: HumanQuestion[];
}

// --- Client capability ask ---

export interface ClientCapabilityAsk {
  type: 'client_capability';
  capability: string;
  metadata?: Record<string, unknown>;
}

// --- Permission ask ---

export interface PermissionAsk {
  type: 'permission';
  question: string;
  description?: string;
  risk?: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

// --- Union of all ask types ---

export type Ask =
  | (HumanQuestion & { target: 'human' })
  | (FormQuestion & { target: 'human' })
  | (ClientCapabilityAsk & { target: 'client' })
  | (PermissionAsk & { target: 'permission' });

// Legacy alias (tools still import UserQuestion)
export type UserQuestion = HumanQuestion | FormQuestion;

// --- AskApi overloaded callable ---

export type AskApi = {
  (request: SingleSelectQuestion & { target: 'human' }): Promise<string>;
  (request: MultiSelectQuestion & { target: 'human' }): Promise<string[]>;
  (request: TextQuestion & { target: 'human' }): Promise<string>;
  (request: ConfirmQuestion & { target: 'human' }): Promise<boolean>;
  (request: FormQuestion & { target: 'human' }): Promise<AskFormResponse>;
  (request: ClientCapabilityAsk & { target: 'client' }): Promise<unknown>;
  (request: PermissionAsk & { target: 'permission' }): Promise<boolean>;
  (request: Ask): Promise<unknown>;
};

// Response types
export interface AskFormResponse {
  answers: Array<{
    question: string;
    answer: unknown;
  }>;
}

// Legacy alias
export type AskUserApi = AskApi;

// ===========================================
// Env API
// ===========================================

export interface EnvApi {
  get(key: string): string | undefined;
  require(key: string): string;
}

// ===========================================
// Logger
// ===========================================

export interface ToolLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ===========================================
// Loaded Tool (server-side, after dynamic import)
// ===========================================

export interface LoadedTool {
  definition: ToolDefinition;
  execute: ToolModule['execute'];
  path: string;
}

// ===========================================
// Legacy Types (still used elsewhere)
// ===========================================

export type ToolApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout';

export interface ToolApproval {
  id: string;
  sessionId: string;
  childSessionId?: string;
  subagentName?: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType?: string;
  permissionKey?: string;
  message?: string;
  details?: Record<string, unknown>;
  status: ToolApprovalStatus;
  requestedAt: string;
  respondedAt?: string | null;
}

export interface ToolEnvVarStatus {
  key: string;
  configured: boolean;
  sensitive: boolean;
  value?: string;
  description?: string;
  defaultValue?: string;
  example?: string;
  usedBy?: string[];
}

// ===========================================
// Tool Execution (for persistence)
// ===========================================

export interface ToolExecution {
  id: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt: string | null;
}
