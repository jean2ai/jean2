import type { HttpClient } from '../transport/http';
import type { ListModelsResponse } from '../types/rest-responses';

interface ListOptions {
  signal?: AbortSignal;
}

export class ModelsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(options?: ListOptions): Promise<ListModelsResponse> {
    return this.http.get('/models', { signal: options?.signal });
  }
}
