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
}

interface UseTerminalOptions {
  serverUrl: string;
  apiToken: string;
  cwd: string;
  serverSessionId?: string | null;
  onStatusChange?: (status: TerminalStatus) => void;
  onExit?: (exitCode: number) => void;
  onSessionInit?: (init: SessionInitData) => void;
  onTitleChange?: (title: string) => void;
}

function encodeFrame(opcode: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = opcode;
  frame.set(payload, 1);
  return frame;
}

export function useTerminal(
  getContainer: () => HTMLDivElement | null,
  options: UseTerminalOptions
): {
  fit: () => void;
  focus: () => void;
  destroy: () => void;
} {
  const { serverUrl, apiToken, cwd } = options;
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<TerminalStatus>('disconnected');
  const disposedRef = useRef(false);
  const wsGenerationRef = useRef(0);

  const onStatusChangeRef = useRef(options.onStatusChange);
  const onExitRef = useRef(options.onExit);
  const onSessionInitRef = useRef(options.onSessionInit);
  const onTitleChangeRef = useRef(options.onTitleChange);

  useEffect(() => {
    onStatusChangeRef.current = options.onStatusChange;
    onExitRef.current = options.onExit;
    onSessionInitRef.current = options.onSessionInit;
    onTitleChangeRef.current = options.onTitleChange;
  });

  const serverUrlRef = useRef(serverUrl);
  const apiTokenRef = useRef(apiToken);
  const cwdRef = useRef(cwd);
  const serverSessionIdRef = useRef(options.serverSessionId);

  useEffect(() => {
    serverUrlRef.current = serverUrl;
    apiTokenRef.current = apiToken;
    cwdRef.current = cwd;
    serverSessionIdRef.current = options.serverSessionId;
  });

  const setStatus = useCallback((status: TerminalStatus) => {
    statusRef.current = status;
    onStatusChangeRef.current?.(status);
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) return;

    const generation = ++wsGenerationRef.current;

    // Close any existing WebSocket and null its handlers to prevent stale callbacks
    const existingWs = wsRef.current;
    if (existingWs) {
      existingWs.onopen = null;
      existingWs.onclose = null;
      existingWs.onmessage = null;
      existingWs.onerror = null;
      existingWs.close();
      wsRef.current = null;
    }

    setStatus('connecting');

    const sessionId = serverSessionIdRef.current;
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

      if (terminalRef.current && fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Container might not be visible yet
        }
      }
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
          const text = new TextDecoder().decode(payload);
          terminalRef.current?.write(text);
          break;
        }
        case OPCODES.EXIT: {
          const { exitCode } = JSON.parse(new TextDecoder().decode(payload)) as { exitCode: number };
          setStatus('exited');
          terminalRef.current?.writeln(`\r\n[Process exited with code ${exitCode}]`);
          onExitRef.current?.(exitCode);
          ws.close();
          break;
        }
        case OPCODES.ERROR: {
          const { message } = JSON.parse(new TextDecoder().decode(payload)) as { message: string };
          setStatus('disconnected');
          terminalRef.current?.writeln(`\r\n[Error: ${message}]`);
          break;
        }
        case OPCODES.INIT_ACK: {
          const initData = JSON.parse(new TextDecoder().decode(payload)) as SessionInitData;
          onSessionInitRef.current?.(initData);

          if (initData.isReconnect && initData.status === 'exited') {
            setStatus('exited');
            terminalRef.current?.writeln(`\r\n[Process exited with code ${initData.exitCode} while disconnected]`);
            onExitRef.current?.(initData.exitCode!);
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
        terminalRef.current?.writeln('\r\n[Connection failed]');
      } else if (statusRef.current === 'connected') {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [setStatus]);

  useEffect(() => {
    const container = getContainer();
    if (!container) {
      console.log(`[useTerminal] MAIN EFFECT: no container, returning early`);
      return;
    }

    // Reset so PROP CHANGE effect skips on StrictMode remount
    isInitialMount.current = true;
    disposedRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      scrollback: 1000,
      allowProposedApi: true,
      theme: {
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

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled || !container.isConnected) return;
      terminal.open(container);

      // Verify the terminal has valid dimensions after opening.
      // If the container was hidden/zero-dim, xterm initializes with
      // invalid state (0 cols/rows). Set up a retry loop to fit once
      // the container becomes visible.
      if (terminal.cols <= 1 || terminal.rows <= 1) {
        const waitForDimensions = () => {
          if (cancelled) return;
          try {
            fitAddon.fit();
            if (terminal.cols > 1 && terminal.rows > 1) return;
          } catch {
            // Container might not be ready yet
          }
          requestAnimationFrame(waitForDimensions);
        };
        requestAnimationFrame(waitForDimensions);
      } else {
        try {
          fitAddon.fit();
        } catch {
          // ignore
        }
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = new TextEncoder().encode(data);
      ws.send(encodeFrame(OPCODES.INPUT, payload));
    });

    terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = new TextEncoder().encode(JSON.stringify({ cols, rows }));
      ws.send(encodeFrame(OPCODES.RESIZE, payload));
    });

    connect();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      disposedRef.current = true;
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        // Do NOT send CLOSE frame — just close the WS (detach)
        // CLOSE frame means "kill the PTY", which we don't want on panel toggle
        ws.close();
        wsRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [getContainer, connect]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      // eslint-disable-next-line react-hooks/immutability
      isInitialMount.current = false;
      return;
    }

    const ws = wsRef.current;
    if (ws) {
      // Do NOT send CLOSE on prop changes — just detach and reconnect
      ws.close();
      wsRef.current = null;
    }

    if (!disposedRef.current && terminalRef.current) {
      connect();
    }
  }, [serverUrl, apiToken, cwd, connect]);

  const fit = useCallback(() => {
    try {
      fitAddonRef.current?.fit();
    } catch {
      // Container might not be visible
    }
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const destroy = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      // DO send CLOSE frame — this tells the server to kill the PTY
      try {
        ws.send(encodeFrame(OPCODES.CLOSE, new Uint8Array(0)));
      } catch {
        // ignore
      }
      ws.close();
      wsRef.current = null;
    }
    terminalRef.current?.dispose();
    terminalRef.current = null;
    fitAddonRef.current = null;
    disposedRef.current = true;
  }, []);

  return { fit, focus, destroy };
}
