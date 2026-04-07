import type { HttpClient } from '../transport/http';
import type { ListPromptsResponse } from '../types/rest-responses';

interface ListOptions {
  signal?: AbortSignal;
}

export class PromptsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(options?: ListOptions): Promise<ListPromptsResponse> {
    return this.http.get('/prompts', { signal: options?.signal });
  }
}