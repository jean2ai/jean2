import type { HttpClient } from '../transport/http';
import type {
  ListToolsResponse,
  GetToolResponse,
  ListToolEnvVarsResponse,
  SetToolEnvVarResponse,
  ClearToolEnvVarResponse,
} from '../types/rest-responses';

interface ListOptions {
  signal?: AbortSignal;
}

interface GetOptions {
  signal?: AbortSignal;
}

export class ToolsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(options?: ListOptions): Promise<ListToolsResponse> {
    return this.http.get('/tools', { signal: options?.signal });
  }

  async get(name: string, options?: GetOptions): Promise<GetToolResponse> {
    return this.http.get(`/tools/${encodeURIComponent(name)}`, {
      signal: options?.signal,
    });
  }

  /**
   * GET /api/tools/env - List all tool env vars with status
   */
  async listEnvVars(options?: ListOptions): Promise<ListToolEnvVarsResponse> {
    return this.http.get('/tools/env', { signal: options?.signal });
  }

  /**
   * PUT /api/tools/env/:key - Set a tool env var value
   */
  async setEnvVar(key: string, data: { value: string }, options?: { signal?: AbortSignal }): Promise<SetToolEnvVarResponse> {
    return this.http.put(`/tools/env/${encodeURIComponent(key)}`, data, {
      signal: options?.signal,
    });
  }

  /**
   * DELETE /api/tools/env/:key - Clear a tool env var
   */
  async clearEnvVar(key: string, options?: { signal?: AbortSignal }): Promise<ClearToolEnvVarResponse> {
    return this.http.delete(`/tools/env/${encodeURIComponent(key)}`, {
      signal: options?.signal,
    });
  }
}
