/**
 * MCP (Model Context Protocol) Module
 *
 * Provides MCP server connectivity and tool integration for the AI agent.
 */

// Configuration
export { loadMcpConfig, getMcpServers, isLocalConfig, isRemoteConfig } from './config';

// Client management
export {
  initializeWorkspace,
  shutdownWorkspace,
  connectServer,
  disconnectServer,
  getServerStatus,
  getAllServerStatus,
  getTools,
  startAuth,
  finishAuth,
} from './manager';

// Tool conversion
export { convertMcpTool, sanitizeToolName } from './converter';

// Auth types (for external use)
export type { McpAuthTokens, McpClientInfo, McpAuthEntry } from './auth';

// OAuth provider (for callback server)
export { McpOAuthProvider, OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } from './oauth-provider';
export type { McpOAuthCallbacks } from './oauth-provider';
