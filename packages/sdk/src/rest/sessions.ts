import type { HttpClient } from '../transport/http';
import type {
  ListSessionsResponse,
  CreateSessionResponse,
  GetSessionResponse,
  UpdateSessionResponse,
  DeleteSessionResponse,
  ListMessagesResponse,
} from '../types/rest-responses';
import type { SessionStatus } from '../types';

interface ListOptions {
  status?: SessionStatus;
  signal?: AbortSignal;
}

interface CreateOptions {
  id?: string;
  workspaceId?: string;
  preconfigId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface UpdateOptions {
  title?: string;
  status?: SessionStatus;
  metadata?: Record<string, unknown>;
}

export class SessionsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(options?: ListOptions): Promise<ListSessionsResponse> {
    return this.http.get('/sessions', {
      params: options?.status ? { status: options.status } : undefined,
      signal: options?.signal,
    });
  }

  async create(options?: CreateOptions): Promise<CreateSessionResponse> {
    const { signal, ...body } = options ?? {};
    return this.http.post('/sessions', body, { signal });
  }

  async get(id: string, options?: { signal?: AbortSignal }): Promise<GetSessionResponse> {
    return this.http.get(`/sessions/${encodeURIComponent(id)}`, { signal: options?.signal });
  }

  async update(id: string, data: UpdateOptions, options?: { signal?: AbortSignal }): Promise<UpdateSessionResponse> {
    return this.http.put(`/sessions/${encodeURIComponent(id)}`, data, { signal: options?.signal });
  }

  async delete(id: string, options?: { signal?: AbortSignal }): Promise<DeleteSessionResponse> {
    return this.http.delete(`/sessions/${encodeURIComponent(id)}`, { signal: options?.signal });
  }

  async listMessages(id: string, options?: { signal?: AbortSignal }): Promise<ListMessagesResponse> {
    return this.http.get(`/sessions/${encodeURIComponent(id)}/messages`, { signal: options?.signal });
  }
}