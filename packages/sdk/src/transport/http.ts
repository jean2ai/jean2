import { AuthError, RateLimitError, ServerError, ValidationError } from '../errors';

export interface HttpClientConfig {
  url: string;
  token: string;
  apiBase?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  params?: Record<string, string>;
}

export class HttpClient {
  private baseUrl: string;
  private token: string;

  constructor(config: HttpClientConfig) {
    const apiBase = config.apiBase || '/api';
    const proto = config.url.startsWith('https') ? 'https' : 'http';
    const clean = config.url.replace(/^https?:\/\//, '');
    this.baseUrl = `${proto}://${clean}${apiBase}`;
    this.token = config.token;
  }

  async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      signal,
      params,
    } = options;

    let url = `${this.baseUrl}${path}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const requestHeaders: Record<string, string> = { ...headers };

    if (body !== undefined && !(body instanceof FormData)) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    requestHeaders['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (response.status === 401) {
      throw new AuthError('Authentication failed. Your token may be invalid or expired.');
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new RateLimitError('Too many requests', retryAfterMs);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as { message?: string };
        if (errorBody?.message) errorMessage = errorBody.message;
      } catch {
        // Ignore parse error for error body
      }

      if (response.status >= 500) {
        throw new ServerError(errorMessage, response.status);
      }
      throw new ValidationError(errorMessage, response.status);
    }

    const contentType = response.headers.get('Content-Type');
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    return response as unknown as T;
  }

  get<T>(path: string, options?: { params?: Record<string, string>; signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
