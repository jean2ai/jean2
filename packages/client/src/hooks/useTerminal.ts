import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const OPCODES = {
  INPUT: 0x01,
  RESIZE: 0x02,
  CLOSE: 0x03,
  OUTPUT: 0x04,
  EXIT: 0x05,
  ERROR: 0x06,
  INIT_ACK: 0x07,
  TITLE: 0x08,
} as const;

export type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'exited';

export interface SessionInitData {
  sessionId: string;
  pid: number;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: 'running' | 'exited';
  exitCode: number | null;
  isReconnect: boolean;
  title: string;
  createdAt: number;
  inAlternateScreen?: boolean;
}

function encodeFrame(opcode: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = opcode;
  frame.set(payload, 1);
  return frame;
}

export interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  serverSessionId: string | null;
  status: TerminalStatus;
  isOpened: boolean;
}

export interface TerminalCache {
  get(id: string): CachedTerminal | undefined;
  set(id: string, cached: CachedTerminal): void;
  delete(id: string): void;
  has(id: string): boolean;
  clear(): void;
  dispose(id: string): void;
  disposeAll(): void;
}

export function createTerminalCache(): TerminalCache {
  const cache = new Map<string, CachedTerminal>();

  return {
    get(id) { return cache.get(id); },
    set(id, cached) { cache.set(id, cached); },
    delete(id) { cache.delete(id); },
    has(id) { return cache.has(id); },
    clear() { cache.clear(); },
    dispose(id) {
      const entry = cache.get(id);
      if (entry) {
        entry.terminal.dispose();
        cache.delete(id);
      }
    },
    disposeAll() {
      for (const entry of cache.values()) {
        entry.terminal.dispose();
      }
      cache.clear();
    },
  };
}

export interface CreateTerminalOptions {
  scrollback?: number;
  fontSize?: number;
  theme?: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
  };
}

export function createTerminalInstance(options?: CreateTerminalOptions): { terminal: Terminal; fitAddon: FitAddon } {
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: options?.fontSize ?? 13,
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
    scrollback: options?.scrollback ?? 5000,
    allowProposedApi: true,
    theme: options?.theme ?? {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      cursor: 'var(--foreground)',
      selectionBackground: 'var(--accent)',
    },
  });

  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  return { terminal, fitAddon };
}

export interface UseTerminalConnectionOptions {
  terminal: Terminal | null;
  serverUrl: string;
  apiToken: string;
  cwd: string;
  serverSessionId?: string | null;
  onOutput: (data: string) => void;
  onStatusChange: (status: TerminalStatus) => void;
  onExit?: (exitCode: number) => void;
  onSessionInit?: (init: SessionInitData) => void;
  onTitleChange?: (title: string) => void;
}

export function useTerminalConnection(
  terminal: Terminal | null,
  options: UseTerminalConnectionOptions
): {
  connect: (sessionId: string | null | undefined) => void;
  disconnect: () => void;
  destroy: () => void;
} {
  const { serverUrl, apiToken, cwd } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<TerminalStatus>('disconnected');
  const disposedRef = useRef(false);
  const wsGenerationRef = useRef(0);

  const onOutputRef = useRef(options.onOutput);
  const onStatusChangeRef = useRef(options.onStatusChange);
  const onExitRef = useRef(options.onExit);
  const onSessionInitRef = useRef(options.onSessionInit);
  const onTitleChangeRef = useRef(options.onTitleChange);

  const serverUrlRef = useRef(serverUrl);
  const apiTokenRef = useRef(apiToken);
  const cwdRef = useRef(cwd);
  const serverSessionIdRef = useRef(options.serverSessionId);
  const terminalRef = useRef(options.terminal);

  useEffect(() => {
    onOutputRef.current = options.onOutput;
    onStatusChangeRef.current = options.onStatusChange;
    onExitRef.current = options.onExit;
    onSessionInitRef.current = options.onSessionInit;
    onTitleChangeRef.current = options.onTitleChange;
  });

  useEffect(() => {
    serverUrlRef.current = serverUrl;
    apiTokenRef.current = apiToken;
    cwdRef.current = cwd;
    serverSessionIdRef.current = options.serverSessionId;
    terminalRef.current = options.terminal;
  }, [serverUrl, apiToken, cwd, options.serverSessionId, options.terminal]);

  const setStatus = useCallback((status: TerminalStatus) => {
    statusRef.current = status;
    onStatusChangeRef.current?.(status);
  }, []);

  const connect = useCallback((sessionId: string | null | undefined) => {
    const generation = ++wsGenerationRef.current;

    const existingWs = wsRef.current;
    if (existingWs) {
      existingWs.onopen = null;
      existingWs.onclose = null;
      existingWs.onmessage = null;
      existingWs.onerror = null;
      existingWs.close();
      wsRef.current = null;
    }

    // Clear terminal on reconnect — server will flush the buffer which duplicates existing content
    if (sessionId && terminalRef.current) {
      terminalRef.current.clear();
    }

    setStatus('connecting');

    const wsUrl = sessionId
      ? `ws://${serverUrlRef.current}/ws/terminal?token=${apiTokenRef.current}&cwd=${encodeURIComponent(cwdRef.current)}&sessionId=${sessionId}`
      : `ws://${serverUrlRef.current}/ws/terminal?token=${apiTokenRef.current}&cwd=${encodeURIComponent(cwdRef.current)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      if (wsGenerationRef.current !== generation) {
        ws.close();
        return;
      }
      wsRef.current = ws;
    };

    ws.onmessage = (event: MessageEvent) => {
      if (wsGenerationRef.current !== generation) return;
      if (!(event.data instanceof ArrayBuffer)) return;

      const data = new Uint8Array(event.data);
      if (data.length < 1) return;

      const opcode = data[0];
      const payload = data.slice(1);

      switch (opcode) {
        case OPCODES.OUTPUT: {
          onOutputRef.current?.(new TextDecoder().decode(payload));
          break;
        }
        case OPCODES.EXIT: {
          const { exitCode } = JSON.parse(new TextDecoder().decode(payload)) as { exitCode: number };
          setStatus('exited');
          onExitRef.current?.(exitCode);
          ws.close();
          break;
        }
        case OPCODES.ERROR: {
          const { message } = JSON.parse(new TextDecoder().decode(payload)) as { message: string };
          console.error('[useTerminal] Server error:', message);
          setStatus('disconnected');
          break;
        }
        case OPCODES.INIT_ACK: {
          const initData = JSON.parse(new TextDecoder().decode(payload)) as SessionInitData;
          onSessionInitRef.current?.(initData);

          if (initData.isReconnect && initData.status === 'exited') {
            setStatus('exited');
            onExitRef.current?.(initData.exitCode!);
          } else if (initData.isReconnect && initData.inAlternateScreen) {
            setStatus('connected');
            onOutputRef.current?.('\r\n\x1b[33m[Reconnected — a full-screen application is running. Press Ctrl+C to exit it.]\x1b[0m\r\n');
          } else {
            setStatus('connected');
          }
          break;
        }
        case OPCODES.TITLE: {
          const { title } = JSON.parse(new TextDecoder().decode(payload)) as { title: string };
          onTitleChangeRef.current?.(title);
          break;
        }
      }
    };

    ws.onclose = () => {
      if (wsGenerationRef.current !== generation) return;
      wsRef.current = null;
      if (statusRef.current === 'connecting') {
        setStatus('disconnected');
      } else if (statusRef.current === 'connected') {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [setStatus]);

  useEffect(() => {
    if (!terminal) return;
    disposedRef.current = false;

    const onDataDisposable = terminal.onData((data: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = new TextEncoder().encode(data);
      ws.send(encodeFrame(OPCODES.INPUT, payload));
    });

    const onResizeDisposable = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = new TextEncoder().encode(JSON.stringify({ cols, rows }));
      ws.send(encodeFrame(OPCODES.RESIZE, payload));
    });

    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      disposedRef.current = true;
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
        wsRef.current = null;
      }
    };
  }, [terminal]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.close();
      wsRef.current = null;
    }
  }, []);

  const destroy = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.send(encodeFrame(OPCODES.CLOSE, new Uint8Array(0)));
      } catch {
        // ignore
      }
      ws.close();
      wsRef.current = null;
    }
    disposedRef.current = true;
  }, []);

  return { connect, disconnect, destroy };
}
