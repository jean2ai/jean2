import type { HttpClient } from '../transport/http';
import type {
  ListTerminalSessionsResponse,
  CreateTerminalSessionResponse,
  GetTerminalSessionResponse,
  DeleteTerminalSessionResponse,
} from '../types/rest-responses';

interface ListOptions {
  signal?: AbortSignal;
}

interface CreateOptions {
  signal?: AbortSignal;
  body?: {
    cwd?: string;
    shell?: string;
  };
}

interface GetOptions {
  signal?: AbortSignal;
}

interface DeleteOptions {
  signal?: AbortSignal;
}

export class TerminalsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(workspaceId: string, options?: ListOptions): Promise<ListTerminalSessionsResponse> {
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/terminals`, {
      signal: options?.signal,
    });
  }

  async create(workspaceId: string, options?: CreateOptions): Promise<CreateTerminalSessionResponse> {
    const { signal, body } = options ?? {};
    return this.http.post(`/workspaces/${encodeURIComponent(workspaceId)}/terminals`, body ?? {}, { signal });
  }

  async get(workspaceId: string, sessionId: string, options?: GetOptions): Promise<GetTerminalSessionResponse> {
    return this.http.get(
      `/workspaces/${encodeURIComponent(workspaceId)}/terminals/${encodeURIComponent(sessionId)}`,
      { signal: options?.signal },
    );
  }

  async delete(workspaceId: string, sessionId: string, options?: DeleteOptions): Promise<DeleteTerminalSessionResponse> {
    return this.http.delete(
      `/workspaces/${encodeURIComponent(workspaceId)}/terminals/${encodeURIComponent(sessionId)}`,
      { signal: options?.signal },
    );
  }
}
