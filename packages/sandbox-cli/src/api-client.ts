import type {
  AutoResponderRule,
  LlmCallContext,
  SandboxCallWaitingEvent,
  SandboxControlEvent,
  SandboxHistoryEntry,
  SandboxResponse,
  SandboxStatus,
} from './types';

interface ApiResult {
  ok?: boolean;
  error?: string;
}

export interface SandboxApiClientOptions {
  host: string;
  port: number;
  token?: string;
}

export class SandboxApiClient {
  private readonly host: string;
  private readonly port: number;
  private readonly token?: string;
  private readonly baseUrl: string;
  private ws: WebSocket | null = null;
  private callWaitingHandler: ((context: LlmCallContext) => void) | null = null;

  constructor(options: SandboxApiClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.token = options.token;
    this.baseUrl = `http://${this.host}:${this.port}/api/sandbox`;
  }

  async connect(): Promise<void> {
    const params = new URLSearchParams();
    if (this.token) {
      params.set('token', this.token);
    }
    const query = params.toString();
    const wsUrl = `ws://${this.host}:${this.port}/ws${query ? `?${query}` : ''}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      ws.onopen = () => {
        this.ws = ws;
        settled = true;
        resolve();
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Failed to connect websocket'));
        }
      };

      ws.onclose = () => {
        this.ws = null;
      };

      ws.onmessage = (event) => {
        const payload = typeof event.data === 'string' ? event.data : '';
        if (!payload) {
          return;
        }

        let message: SandboxControlEvent;
        try {
          message = JSON.parse(payload) as SandboxControlEvent;
        } catch {
          return;
        }

        if (message.type === 'sandbox.call_waiting' && this.callWaitingHandler) {
          const waiting = message as SandboxCallWaitingEvent;
          this.callWaitingHandler(waiting.context);
        }
      };
    });
  }

  onCallWaitingEvent(handler: (context: LlmCallContext) => void): void {
    this.callWaitingHandler = handler;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  async getStatus(): Promise<SandboxStatus> {
    return this.getJson<SandboxStatus>('/status');
  }

  async getPendingCalls(): Promise<LlmCallContext[]> {
    return this.getJson<LlmCallContext[]>('/pending');
  }

  async getPendingCall(callId: string): Promise<LlmCallContext | null> {
    const response = await fetch(this.url(`/pending/${encodeURIComponent(callId)}`), {
      headers: this.headers(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch call ${callId}: ${response.statusText}`);
    }

    return response.json() as Promise<LlmCallContext>;
  }

  async respond(callId: string, response: SandboxResponse): Promise<void> {
    const result = await this.postJson<ApiResult>(`/pending/${encodeURIComponent(callId)}/respond`, response);
    if (result.ok === false) {
      throw new Error(result.error || `Failed to respond to ${callId}`);
    }
  }

  async getHistory(): Promise<SandboxHistoryEntry[]> {
    return this.getJson<SandboxHistoryEntry[]>('/history');
  }

  async clearHistory(): Promise<void> {
    const result = await this.requestJson<ApiResult>('DELETE', '/history');
    if (result.ok === false) {
      throw new Error(result.error || 'Failed to clear history');
    }
  }

  async getAutoResponderRules(): Promise<AutoResponderRule[]> {
    return this.getJson<AutoResponderRule[]>('/auto-responder');
  }

  async setAutoResponderRules(rules: AutoResponderRule[]): Promise<void> {
    const result = await this.putJson<ApiResult>('/auto-responder', { rules });
    if (result.ok === false) {
      throw new Error(result.error || 'Failed to set auto-responder rules');
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path), {
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new Error(`GET ${path} failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>('POST', path, body);
  }

  private async putJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>('PUT', path, body);
  }

  private async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.url(path), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `${method} ${path} failed: ${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return payload as T;
  }
}
