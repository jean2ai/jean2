import type { HttpClient } from '../transport/http';
import type {
  GetMcpStatusResponse,
  ConnectMcpServerResponse,
  DisconnectMcpServerResponse,
  StartMcpAuthResponse,
  FinishMcpAuthResponse,
} from '../types/rest-responses';

interface GetMcpStatusOptions {
  signal?: AbortSignal;
}

interface ConnectMcpServerOptions {
  signal?: AbortSignal;
}

interface DisconnectMcpServerOptions {
  signal?: AbortSignal;
}

interface StartMcpAuthOptions {
  signal?: AbortSignal;
}

interface FinishMcpAuthOptions {
  signal?: AbortSignal;
}

export class McpRestNamespace {
  constructor(private http: HttpClient) {}

  /**
   * GET /api/workspaces/:id/mcp/status - Get MCP server status for a workspace
   */
  async getStatus(
    workspaceId: string,
    options?: GetMcpStatusOptions,
  ): Promise<GetMcpStatusResponse> {
    return this.http.get(
      `/workspaces/${encodeURIComponent(workspaceId)}/mcp/status`,
      { signal: options?.signal },
    );
  }

  /**
   * POST /api/workspaces/:id/mcp/connect - Connect to an MCP server
   */
  async connect(
    workspaceId: string,
    name: string,
    options?: ConnectMcpServerOptions,
  ): Promise<ConnectMcpServerResponse> {
    const { signal } = options ?? {};
    return this.http.post(
      `/workspaces/${encodeURIComponent(workspaceId)}/mcp/connect`,
      { name },
      { signal },
    );
  }

  /**
   * POST /api/workspaces/:id/mcp/disconnect - Disconnect from an MCP server
   */
  async disconnect(
    workspaceId: string,
    name: string,
    options?: DisconnectMcpServerOptions,
  ): Promise<DisconnectMcpServerResponse> {
    const { signal } = options ?? {};
    return this.http.post(
      `/workspaces/${encodeURIComponent(workspaceId)}/mcp/disconnect`,
      { name },
      { signal },
    );
  }

  /**
   * POST /api/workspaces/:id/mcp/auth - Start OAuth flow for a server
   */
  async startAuth(
    workspaceId: string,
    name: string,
    options?: StartMcpAuthOptions,
  ): Promise<StartMcpAuthResponse> {
    const { signal } = options ?? {};
    return this.http.post(
      `/workspaces/${encodeURIComponent(workspaceId)}/mcp/auth`,
      { name },
      { signal },
    );
  }

  /**
   * POST /api/workspaces/:id/mcp/auth/callback - Handle OAuth callback
   */
  async finishAuth(
    workspaceId: string,
    name: string,
    code: string,
    options?: FinishMcpAuthOptions,
  ): Promise<FinishMcpAuthResponse> {
    const { signal } = options ?? {};
    return this.http.post(
      `/workspaces/${encodeURIComponent(workspaceId)}/mcp/auth/callback`,
      { name, code },
      { signal },
    );
  }
}
