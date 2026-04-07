import type { HttpClient } from '../transport/http';
import type {
  ListToolsResponse,
  GetToolResponse,
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
}
