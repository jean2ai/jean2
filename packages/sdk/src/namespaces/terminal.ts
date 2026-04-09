import type { TerminalSessionInit } from '../protocol/terminal';
import { ConnectionError } from '../errors';
import { TypedEventEmitter } from '../emitter';

export const TERMINAL_OPCODES = {
  INPUT: 0x01,
  RESIZE: 0x02,
  CLOSE: 0x03,
  OUTPUT: 0x04,
  EXIT: 0x05,
  ERROR: 0x06,
  INIT_ACK: 0x07,
  TITLE: 0x08,
} as const;

export type TerminalOpcode = typeof TERMINAL_OPCODES[keyof typeof TERMINAL_OPCODES];

export interface TerminalEventMap {
  [key: string]: unknown[];

  output: [data: Uint8Array];
  exit: [exitCode: number];
  title: [title: string];
  close: [];
  error: [error: Error];
}

function encodeFrame(opcode: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = opcode;
  frame.set(payload, 1);
  return frame;
}

export class TerminalConnection extends TypedEventEmitter<TerminalEventMap> {
  private ws: WebSocket;
  private _session: TerminalSessionInit;
  private _closed = false;
  private _disposed = false;

  constructor(ws: WebSocket, session: TerminalSessionInit) {
    super();
    this.ws = ws;
    this._session = session;

    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  private handleMessage(event: MessageEvent): void {
    if (this._closed) return;

    const data = new Uint8Array(event.data);
    if (data.length < 1) return;

    const opcode = data[0] as TerminalOpcode;
    const payload = data.slice(1);

    switch (opcode) {
      case TERMINAL_OPCODES.OUTPUT:
        this.emit('output', payload);
        break;

      case TERMINAL_OPCODES.EXIT: {
        let exitCode = 0;
        if (payload.length > 0) {
          try {
            const parsed = JSON.parse(new TextDecoder().decode(payload)) as { exitCode: unknown };
            exitCode = typeof parsed.exitCode === 'number' ? parsed.exitCode : 0;
          } catch {
            exitCode = 0;
          }
        }
        this._session = { ...this._session, status: 'exited', exitCode };
        this.emit('exit', exitCode);
        break;
      }

      case TERMINAL_OPCODES.TITLE: {
        let title = 'Terminal';
        if (payload.length > 0) {
          try {
            const parsed = JSON.parse(new TextDecoder().decode(payload)) as { title: unknown };
            title = typeof parsed.title === 'string' ? parsed.title : 'Terminal';
          } catch {
            title = 'Terminal';
          }
        }
        this._session = { ...this._session, title };
        this.emit('title', title);
        break;
      }

      case TERMINAL_OPCODES.ERROR: {
        const errorMessage = new TextDecoder().decode(payload);
        const error = new Error(errorMessage || 'Terminal error');
        this.emit('error', error);
        break;
      }

      case TERMINAL_OPCODES.CLOSE:
        this.doClose();
        break;

      default:
        break;
    }
  }

  private handleClose(_event: CloseEvent): void {
    if (!this._closed) {
      this._closed = true;
      this.emit('close');
    }
  }

  private handleError(): void {
    if (!this._closed) {
      const error = new Error('WebSocket error');
      this.emit('error', error);
    }
  }

  private doClose(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this.ws.close(1000, 'Client close');
    } catch {
      // Ignore close errors
    }
    this.emit('close');
    this.cleanupHandlers();
  }

  private cleanupHandlers(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.ws.onmessage = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
  }

  write(data: string | Uint8Array): void {
    if (this._closed) return;
    if (this.ws.readyState !== WebSocket.OPEN) return;

    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else {
      bytes = data;
    }

    this.ws.send(encodeFrame(TERMINAL_OPCODES.INPUT, bytes));
  }

  resize(cols: number, rows: number): void {
    if (this._closed) return;
    if (this.ws.readyState !== WebSocket.OPEN) return;

    const jsonPayload = JSON.stringify({ cols, rows });
    const payload = new TextEncoder().encode(jsonPayload);
    this.ws.send(encodeFrame(TERMINAL_OPCODES.RESIZE, payload));
  }

  close(): void {
    if (this._closed) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeFrame(TERMINAL_OPCODES.CLOSE, new Uint8Array(0)));
    }
    this.doClose();
  }

  dispose(): void {
    this.cleanupHandlers();
    if (!this._closed) {
      this._closed = true;
      try {
        this.ws.close(1000, 'Disposed');
      } catch {
        // Ignore close errors
      }
    }
    this.removeAllListeners();
  }

  get session(): TerminalSessionInit {
    return this._session;
  }

  get sessionId(): string {
    return this._session.sessionId;
  }

  get pid(): number {
    return this._session.pid;
  }

  get cwd(): string {
    return this._session.cwd;
  }

  get shell(): string {
    return this._session.shell;
  }

  get cols(): number {
    return this._session.cols;
  }

  get rows(): number {
    return this._session.rows;
  }

  get title(): string {
    return this._session.title;
  }

  get status(): 'running' | 'exited' {
    return this._session.status;
  }

  get exitCode(): number | null {
    return this._session.exitCode;
  }

  get isReconnect(): boolean {
    return this._session.isReconnect;
  }

  get closed(): boolean {
    return this._closed;
  }
}

export interface TerminalConnectOptions {
  workspaceId: string;
  cwd: string;
  shell?: string;
  sessionId?: string;
}

export interface TerminalConfig {
  url: string;
  token: string;
  wsConstructor?: typeof WebSocket;
  connectTimeout?: number;
}

export class TerminalNamespace {
  private config: TerminalConfig;

  constructor(config: TerminalConfig) {
    this.config = {
      connectTimeout: 10000,
      ...config,
    };
  }

  async connect(options: TerminalConnectOptions): Promise<TerminalConnection> {
    const WsConstructor = this.config.wsConstructor ?? globalThis.WebSocket;
    const proto = this.config.url.startsWith('https') ? 'wss' : 'ws';
    const clean = this.config.url.replace(/^https?:\/\//, '');

    const params = new URLSearchParams({
      token: this.config.token,
      cwd: options.cwd,
      workspaceId: options.workspaceId,
    });

    if (options.shell) params.set('shell', options.shell);
    if (options.sessionId) params.set('sessionId', options.sessionId);

    const wsUrl = `${proto}://${clean}/ws/terminal?${params.toString()}`;

    return new Promise((resolve, reject) => {
      const ws = new WsConstructor(wsUrl);
      ws.binaryType = 'arraybuffer';
      const timeout = this.config.connectTimeout ?? 10000;
      let resolved = false;

      const doResolve = (conn: TerminalConnection) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(conn);
        }
      };

      const doReject = (err: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(err);
        }
      };

      const timeoutId = setTimeout(() => {
        ws.close();
        doReject(new ConnectionError(`Terminal connection timeout (${timeout}ms)`));
      }, timeout);

      ws.onopen = () => {
        // Waiting for INIT_ACK or ERROR
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = new Uint8Array(event.data);
        if (data.length < 1) return;

        const opcode = data[0];
        if (opcode === TERMINAL_OPCODES.INIT_ACK) {
          try {
            const init = JSON.parse(
              new TextDecoder().decode(data.slice(1)),
            ) as TerminalSessionInit;
            doResolve(new TerminalConnection(ws, init));
          } catch (err: unknown) {
            ws.close();
            const message = err instanceof Error ? err.message : String(err);
            doReject(new ConnectionError(`Failed to parse terminal init: ${message}`));
          }
        } else if (opcode === TERMINAL_OPCODES.ERROR) {
          ws.close();
          let errorMessage = 'Terminal connection failed';
          try {
            const parsed = JSON.parse(new TextDecoder().decode(data.slice(1))) as { message?: string };
            errorMessage = parsed.message || errorMessage;
          } catch {
            // Use default message
          }
          doReject(new ConnectionError(errorMessage));
        }
      };

      ws.onerror = () => {
        ws.close();
        doReject(new ConnectionError('Terminal WebSocket error'));
      };

      ws.onclose = () => {
        doReject(new ConnectionError('Terminal connection closed before init'));
      };
    });
  }
}