export { Jean2Client } from './client';
export { TypedEventEmitter } from './emitter';
export type { EventMap } from './emitter';

export {
  Jean2Error,
  ConnectionError,
  AuthError,
  RateLimitError,
  TimeoutError,
  ServerError,
  ValidationError,
} from './errors';

export { version } from './version';

export type { SdkEventMap } from './types/server-messages';
export { routeServerMessage } from './types/server-messages';

export { WebSocketTransport } from './transport/websocket';
export type { WebSocketTransportConfig, WsState } from './transport/websocket';

export { HttpClient } from './transport/http';
export type { HttpClientConfig } from './transport/http';

export { SessionsNamespace } from './namespaces/sessions';
export { ChatNamespace } from './namespaces/chat';
export { PermissionsNamespace } from './namespaces/permissions';
export { QueueNamespace } from './namespaces/queue';
export { ProvidersNamespace } from './namespaces/providers';

export {
  TerminalConnection,
  TerminalNamespace,
  TERMINAL_OPCODES,
} from './namespaces/terminal';
export type {
  TerminalEventMap,
  TerminalConnectOptions,
  TerminalConfig,
  TerminalOpcode,
} from './namespaces/terminal';

export { SessionsRestNamespace } from './rest/sessions';
export { WorkspacesRestNamespace } from './rest/workspaces';
export { ToolsRestNamespace } from './rest/tools';
export { PromptsRestNamespace } from './rest/prompts';
export { ModelsRestNamespace } from './rest/models';
export { PreconfigsRestNamespace } from './rest/preconfigs';
export { ProvidersRestNamespace } from './rest/providers';
export { FilesRestNamespace } from './rest/files';
export { AttachmentsRestNamespace } from './rest/attachments';
export { TerminalsRestNamespace } from './rest/terminals';
export { McpRestNamespace } from './rest/mcp';
export { ConfigRestNamespace } from './rest/config';
export { ConfigModelsNamespace, ConfigPromptsNamespace } from './rest/config';
export { HttpNamespace } from './rest/http-namespace';
export type { LoadAllResult } from './rest/http-namespace';

export type { ClientConfig, ConnectionState, SdkEvent, ReconnectOptions, HeartbeatOptions } from './types';

// Re-export domain types from ./types for SDK consumers
export type {
  Session,
  SessionStatus,
  SubagentStatus,
  Message,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  MessageRole,
  AssistantStatus,
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  ImagePart,
  StepPart,
  CompactionPart,
  MessageWithParts,
  QueuedMessage,
  PartField,
  MessageEvent,
  Workspace,
  Preconfig,
  PreconfigMode,
  PromptInfo,
  ToolPermission,
  PermissionType,
  PermissionKey,
  SessionInterruptResult,
  InterruptReason,
  InterruptState,
  ToolDefinition,
  ToolRuntime,
  ProviderStatus,
  AuthType,
  ProviderDescriptor,
  AttachmentKind,
  FileEntry,
  FilePreviewResponse,
  AnyVisualization,
  McpStatus,
  McpServerConfig,
  ModelWithStatus,
  ModelRuntimeStatus,
  TerminalEvent,
  FileListItem,
  TodoListItem,
} from './types';

export {
  isTextPart,
  isToolPart,
  isReasoningPart,
  isStepPart,
  isImagePart,
  isFilePart,
  isCompactionPart,
  isAssistantMessage,
  isUserMessage,
} from './types';

// State management (Phase 4)
export { SessionManager } from './state';
export { MessageStore } from './state';
export { PermissionTracker } from './state';

export type {
  SessionManagerOptions,
  MessageStoreOptions,
  PermissionTrackerOptions,
  SessionManagerEventMap,
  MessageStoreEventMap,
  PermissionTrackerEventMap,
  PendingPermissionRequest,
} from './types';
