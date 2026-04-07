import type { Session, Message } from '@jean2/shared';

/**
 * GET /api/sessions
 */
export interface ListSessionsResponse {
  sessions: Session[];
}

/**
 * POST /api/sessions
 */
export interface CreateSessionResponse {
  session: Session;
}

/**
 * GET /api/sessions/:id
 */
export interface GetSessionResponse {
  session: Session;
}

/**
 * PUT /api/sessions/:id
 */
export interface UpdateSessionResponse {
  session: Session;
}

/**
 * DELETE /api/sessions/:id
 */
export interface DeleteSessionResponse {
  success: boolean;
}

/**
 * GET /api/sessions/:id/messages
 */
export interface ListMessagesResponse {
  messages: Message[];
}

/**
 * GET /api/workspaces
 */
export interface ListWorkspacesResponse {
  workspaces: import('@jean2/shared').Workspace[];
}

/**
 * POST /api/workspaces
 */
export interface CreateWorkspaceResponse {
  workspace: import('@jean2/shared').Workspace;
}

/**
 * GET /api/workspaces/:id
 */
export interface GetWorkspaceResponse {
  workspace: import('@jean2/shared').Workspace;
}

/**
 * PATCH /api/workspaces/:id
 */
export interface UpdateWorkspaceResponse {
  workspace: import('@jean2/shared').Workspace;
}

/**
 * DELETE /api/workspaces/:id
 */
export interface DeleteWorkspaceResponse {
  success: boolean;
  deletedSessions: string[];
}

/**
 * GET /api/workspaces/:id/sessions
 */
export interface ListWorkspaceSessionsResponse {
  sessions: Session[];
}

/**
 * GET /api/tools
 */
export interface ListToolsResponse {
  tools: import('@jean2/shared').ToolDefinition[];
}

/**
 * GET /api/tools/:name
 */
export interface GetToolResponse {
  tool: import('@jean2/shared').ToolDefinition;
}

/**
 * GET /api/prompts
 */
export interface ListPromptsResponse {
  prompts: import('@jean2/shared').PromptInfo[];
}

/**
 * GET /api/models
 */
export interface ListModelsResponse {
  models: import('@jean2/shared').ModelWithStatus[];
  defaultModel: string;
  defaultProvider: string;
}

/**
 * GET /api/preconfigs
 */
export interface ListPreconfigsResponse {
  preconfigs: import('@jean2/shared').Preconfig[];
}

/**
 * POST /api/preconfigs
 */
export interface CreatePreconfigResponse {
  preconfig: import('@jean2/shared').Preconfig;
}

/**
 * GET /api/preconfigs/:id
 */
export interface GetPreconfigResponse {
  preconfig: import('@jean2/shared').Preconfig;
}

/**
 * PUT /api/preconfigs/:id
 */
export interface UpdatePreconfigResponse {
  preconfig: import('@jean2/shared').Preconfig;
}

/**
 * DELETE /api/preconfigs/:id
 */
export interface DeletePreconfigResponse {
  success: boolean;
}

/**
 * GET /api/providers
 */
export interface ListProvidersResponse {
  providers: import('@jean2/shared').ProviderStatus[];
}

/**
 * GET /api/providers/:providerId/status
 */
export interface GetProviderStatusResponse {
  status: import('@jean2/shared').ProviderStatus;
}

/**
 * POST /api/providers/:providerId/connect
 */
export interface ConnectProviderResponse {
  authorizationUrl: string;
  status: import('@jean2/shared').ProviderStatus;
}

/**
 * DELETE /api/providers/:providerId
 */
export interface DisconnectProviderResponse {
  success: boolean;
}

/**
 * GET /api/config/providers
 */
export interface ListCredentialsResponse {
  providers: import('@jean2/shared').ProviderCredentialStatus[];
}

/**
 * PUT /api/config/providers/:provider
 */
export interface SetCredentialResponse {
  provider: string;
  configured: boolean;
}

/**
 * DELETE /api/config/providers/:provider
 */
export interface ClearCredentialResponse {
  provider: string;
  configured: boolean;
}

// =============================================================================
// Config: Models Responses
// =============================================================================

/**
 * GET /api/config/models
 * Returns full models config with runtime status per model.
 */
export type GetModelsConfigResponse = import('@jean2/shared').ModelsConfigResponse;

/**
 * POST /api/config/models/providers
 * Returns the updated full models config after provider creation.
 */
export type CreateProviderResponse = import('@jean2/shared').ModelsConfig;

/**
 * PUT /api/config/models/providers/:id
 * Returns the updated full models config after provider update.
 */
export type UpdateProviderResponse = import('@jean2/shared').ModelsConfig;

/**
 * DELETE /api/config/models/providers/:id
 * Returns the updated full models config after provider deletion.
 */
export type DeleteProviderResponse = import('@jean2/shared').ModelsConfig;

/**
 * POST /api/config/models/providers/:id/models
 * Returns the updated full models config after model creation.
 */
export type CreateModelResponse = import('@jean2/shared').ModelsConfig;

/**
 * PUT /api/config/models/providers/:providerId/models/:modelId
 * Returns the updated full models config after model update.
 */
export type UpdateModelResponse = import('@jean2/shared').ModelsConfig;

/**
 * DELETE /api/config/models/providers/:providerId/models/:modelId
 * Returns the updated full models config after model deletion.
 */
export type DeleteModelResponse = import('@jean2/shared').ModelsConfig;

/**
 * PUT /api/config/models/defaults
 * Returns the updated full models config after setting defaults.
 */
export type SetDefaultsResponse = import('@jean2/shared').ModelsConfig;

// =============================================================================
// Config: Prompts Responses
// =============================================================================

/**
 * GET /api/config/prompts
 * Returns a list of all prompt configurations.
 */
export interface ListPromptConfigsResponse {
  prompts: import('@jean2/shared').PromptInfo[];
}

/**
 * GET /api/config/prompts/:name
 * Returns a single prompt configuration.
 */
export type GetPromptConfigResponse = import('@jean2/shared').PromptInfo;

/**
 * POST /api/config/prompts
 * Returns the created prompt configuration.
 */
export type CreatePromptConfigResponse = import('@jean2/shared').PromptInfo;

/**
 * PUT /api/config/prompts/:name
 * Returns the updated prompt configuration.
 */
export type UpdatePromptConfigResponse = import('@jean2/shared').PromptInfo;

/**
 * DELETE /api/config/prompts/:name
 */
export interface DeletePromptConfigResponse {
  success: boolean;
}

/**
 * Single attachment shape returned by the server (list + upload).
 */
export interface AttachmentItem {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

/**
 * GET /api/sessions/:id/attachments
 */
export interface ListAttachmentsResponse {
  attachments: AttachmentItem[];
}

/**
 * POST /api/sessions/:id/attachments
 */
export type UploadAttachmentResponse = AttachmentItem;

/**
 * GET /api/workspaces/:id/files (browse mode)
 */
export interface BrowseFilesResponse {
  files: import('@jean2/shared').FileEntry[];
  currentPath: string;
  mode: 'browse';
}

/**
 * GET /api/workspaces/:id/files (search mode)
 */
export interface SearchFilesResponse {
  files: import('@jean2/shared').FileEntry[];
  currentPath: string;
  mode: 'search';
}

/**
 * GET /api/workspaces/:id/file-preview
 */
export type PreviewFileResponse = import('@jean2/shared').FilePreviewResponse;

/**
 * GET /api/fs/browse
 */
export interface BrowseFsResponse {
  files: import('@jean2/shared').FileEntry[];
  currentPath: string;
  mode: 'browse';
  isRoot: boolean;
}

/**
 * GET /api/fs/parent
 */
export interface FsParentResponse {
  files: import('@jean2/shared').FileEntry[];
  currentPath: string;
  mode: 'browse';
  isRoot: boolean;
}

/**
 * GET /api/fs/drives
 */
export interface ListDrivesResponse {
  drives: string[];
}

/**
 * GET /api/workspaces/:id/terminals
 */
export interface ListTerminalSessionsResponse {
  sessions: import('@jean2/shared').TerminalSessionInfo[];
}

/**
 * POST /api/workspaces/:id/terminals
 */
export interface CreateTerminalSessionResponse {
  session: import('@jean2/shared').TerminalSessionInfo;
}

/**
 * GET /api/workspaces/:id/terminals/:sessionId
 */
export type GetTerminalSessionResponse = import('@jean2/shared').TerminalSessionInfo;

/**
 * DELETE /api/workspaces/:id/terminals/:sessionId
 */
export interface DeleteTerminalSessionResponse {
  success: boolean;
}

// =============================================================================
// MCP Responses
// =============================================================================

/**
 * GET /api/workspaces/:id/mcp/status
 * Returns a keyed record of server name -> { config, status }
 */
export interface GetMcpStatusResponse {
  status: Record<string, { config: import('@jean2/shared').McpServerConfig | undefined; status: import('@jean2/shared').McpStatus }>;
}

/**
 * POST /api/workspaces/:id/mcp/connect
 */
export interface ConnectMcpServerResponse {
  status: import('@jean2/shared').McpStatus;
}

/**
 * POST /api/workspaces/:id/mcp/disconnect
 */
export interface DisconnectMcpServerResponse {
  success: boolean;
}

/**
 * POST /api/workspaces/:id/mcp/auth
 */
export interface StartMcpAuthResponse {
  authorizationUrl: string;
}

/**
 * POST /api/workspaces/:id/mcp/auth/callback
 */
export interface FinishMcpAuthResponse {
  status: import('@jean2/shared').McpStatus;
}