declare interface Event {
  readonly type: string;
}

declare interface MessageEvent extends Event {
  readonly data: unknown;
}

declare interface CloseEvent extends Event {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

declare class WebSocket {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;
  readyState: number;
  url: string;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (this: WebSocket, ev: Event) => unknown): void;
  removeEventListener(type: string, listener: (this: WebSocket, ev: Event) => unknown): void;
}

declare interface Navigator {
  readonly onLine: boolean;
}

declare interface Document {
  readonly visibilityState: string;
  addEventListener(type: string, listener: (ev: Event) => unknown): void;
  removeEventListener(type: string, listener: (ev: Event) => unknown): void;
}

declare interface Window {
  navigator: Navigator;
  document: Document;
  addEventListener(type: string, listener: (ev: Event) => unknown): void;
  removeEventListener(type: string, listener: (ev: Event) => unknown): void;
}

declare const window: Window;
declare const document: Document;
declare const navigator: Navigator;
