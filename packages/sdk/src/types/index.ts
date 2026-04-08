// Domain types
export type {
  Session,
  SessionStatus,
  SubagentStatus,
} from '@jean2/shared';

export type {
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
} from '@jean2/shared';

export type { Workspace } from '@jean2/shared';
export type { Preconfig, PreconfigMode } from '@jean2/shared';
export type { PromptInfo } from '@jean2/shared';

export type {
  ToolPermission,
  PermissionType,
  PermissionKey,
} from '@jean2/shared';

export type {
  SessionInterruptResult,
  InterruptReason,
  InterruptState,
} from '@jean2/shared';

export type {
  ToolDefinition,
  ToolRuntime,
} from '@jean2/shared';

export type {
  ModelDefinition,
  ModelTier,
  ProviderDefinition,
  ModelWithProvider,
  ModelsConfig,
  AttachmentKind,
  ModelCapabilities,
} from '@jean2/shared';

export type {
  ProviderStatus,
  AuthType,
  ProviderDescriptor,
} from '@jean2/shared';

// Protocol types
export type {
  ClientMessage,
  SessionCreateMessage,
  SessionResumeMessage,
  ChatMessage,
  ChatMessageAttachment,
  SessionCloseMessage,
  SessionUpdateMessage,
  SessionUpdateModelMessage,
  SessionReopenMessage,
  SessionDeleteMessage,
  SessionRenameMessage,
  PermissionResponseMessage,
  PermissionListRequestMessage,
  PermissionRevokeMessage,
  PermissionRevokeAllMessage,
  PermissionsSyncMessage,
  SessionCompactMessage,
  SessionRevertMessage,
  SessionForkMessage,
  SessionInterruptMessage,
  QueueAddMessage,
  QueueRemoveMessage,
  ProviderConnectMessage,
  ProviderDisconnectMessage,
  ToolApprovalMessage,
  ServerMessage,
} from '@jean2/shared';

// Individual server message types
export type {
  SessionCreatedMessage,
  SessionResumedMessage,
  MessageCreatedMessage,
  MessageUpdatedMessage,
  PartCreatedMessage,
  PartUpdatedMessage,
  PartAppendMessage,
  SessionClosedMessage,
  SessionUpdatedMessage,
  SessionReopenedMessage,
  SessionDeletedMessage,
  SessionRenamedMessage,
  SessionInterruptedMessage,
  SessionRevertedMessage,
  SessionForkedMessage,
  SessionStateMessage,
  ChatUsageMessage,
  CompactionCompleteMessage,
  PermissionRequestMessage,
  PermissionGrantedMessage,
  PermissionListMessage,
  PermissionRevokedMessage,
  PermissionAllRevokedMessage,
  PermissionsSyncResponseMessage,
  ToolApprovalRequiredMessage,
  QueueListMessage,
  QueueAddedMessage,
  QueueRemovedMessage,
  QueueSendingMessage,
  SubagentStartedMessage,
  SubagentCompletedMessage,
  SubagentProgressMessage,
  ProviderStatusMessage,
  ProviderConnectedMessage,
  ErrorMessage,
  RateLimitErrorMessage,
  ServerErrorMessage,
  TimeoutErrorMessage,
  AuthErrorMessage,
  InvalidRequestErrorMessage,
  ContextOverflowErrorMessage,
} from '@jean2/shared';

// Terminal types
export type {
  TerminalSessionInfo,
  TerminalSessionInit,
  TerminalEvent,
} from '@jean2/shared';

// Type guards
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
} from '@jean2/shared';

// Configuration types
export type {
  ModelWithStatus,
  ModelRuntimeStatus,
  ModelsConfigResponse,
  ProviderWithStatus,
  ProviderCredentialStatus,
  ProviderCredentialsResponse,
  CreateProviderRequest,
  UpdateProviderRequest,
  CreateModelRequest,
  UpdateModelRequest,
  SetDefaultsRequest,
  CreatePromptRequest,
  UpdatePromptRequest,
} from '@jean2/shared';

// File types
export type {
  FileEntry,
  FileListResponse,
  FileSearchResult,
  FilePreviewKind,
  FilePreviewResponse,
  FilePreviewContentResponse,
} from '@jean2/shared';

// MCP types
export type {
  McpServerConfig,
  McpConfig,
  McpStatus,
  McpServerInfo,
} from '@jean2/shared';

// Visualization types
export type {
  VisualizationType,
  ToolVisualization,
  AnyVisualization,
  FileListItem,
  TodoListItem,
} from '@jean2/shared';

// SDK-specific types
export type { ClientConfig, ConnectionState, SdkEvent, ReconnectOptions, HeartbeatOptions } from './sdk-types';
export type { SdkEventMap } from './server-messages';

// REST response types
export type {
  ListSessionsResponse,
  CreateSessionResponse,
  GetSessionResponse,
  UpdateSessionResponse,
  DeleteSessionResponse,
  ListMessagesResponse,
  ListWorkspacesResponse,
  CreateWorkspaceResponse,
  GetWorkspaceResponse,
  UpdateWorkspaceResponse,
  DeleteWorkspaceResponse,
  ListWorkspaceSessionsResponse,
  ListToolsResponse,
  GetToolResponse,
  ListModelsResponse,
  ListPromptsResponse,
  ListProvidersResponse,
  GetProviderStatusResponse,
  ConnectProviderResponse,
  DisconnectProviderResponse,
  ListCredentialsResponse,
  SetCredentialResponse,
  ClearCredentialResponse,
  ListPreconfigsResponse,
  GetPreconfigResponse,
  CreatePreconfigResponse,
  UpdatePreconfigResponse,
  DeletePreconfigResponse,
  ListAttachmentsResponse,
  UploadAttachmentResponse,
  BrowseFilesResponse,
  SearchFilesResponse,
  PreviewFileResponse,
  BrowseFsResponse,
  FsParentResponse,
  ListDrivesResponse,
  ListTerminalSessionsResponse,
  CreateTerminalSessionResponse,
  GetTerminalSessionResponse,
  DeleteTerminalSessionResponse,
  GetMcpStatusResponse,
  ConnectMcpServerResponse,
  DisconnectMcpServerResponse,
  StartMcpAuthResponse,
  FinishMcpAuthResponse,
  GetModelsConfigResponse,
  CreateProviderResponse,
  UpdateProviderResponse,
  DeleteProviderResponse,
  CreateModelResponse,
  UpdateModelResponse,
  DeleteModelResponse,
  SetDefaultsResponse,
  ListPromptConfigsResponse,
  GetPromptConfigResponse,
  CreatePromptConfigResponse,
  UpdatePromptConfigResponse,
  DeletePromptConfigResponse,
} from './rest-responses';

// State management types
export type {
  SessionManagerOptions,
  MessageStoreOptions,
  PermissionTrackerOptions,
  SessionManagerEventMap,
  MessageStoreEventMap,
  PermissionTrackerEventMap,
  PendingPermissionRequest,
} from './state-types';
