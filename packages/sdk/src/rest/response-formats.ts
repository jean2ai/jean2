import type { HttpClient } from '../transport/http';
import type { ResponseFormat } from '../shared';

interface ListOptions {
  signal?: AbortSignal;
}

export interface ListResponseFormatsResponse {
  formats: ResponseFormat[];
}

export interface GetResponseFormatResponse {
  format: ResponseFormat;
}

export interface CreateResponseFormatRequest {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
}

export interface UpdateResponseFormatRequest {
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

export class ResponseFormatsRestNamespace {
  constructor(private http: HttpClient) {}

  async list(options?: ListOptions): Promise<ListResponseFormatsResponse> {
    return this.http.get('/response-formats', { signal: options?.signal });
  }

  async get(id: string, options?: ListOptions): Promise<GetResponseFormatResponse> {
    return this.http.get(`/response-formats/${encodeURIComponent(id)}`, { signal: options?.signal });
  }

  async create(body: CreateResponseFormatRequest): Promise<GetResponseFormatResponse> {
    return this.http.post('/response-formats', body);
  }

  async update(id: string, body: UpdateResponseFormatRequest): Promise<GetResponseFormatResponse> {
    return this.http.put(`/response-formats/${encodeURIComponent(id)}`, body);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.http.delete(`/response-formats/${encodeURIComponent(id)}`);
  }
}
