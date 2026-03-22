import { existsSync, statSync } from 'fs';
import type { ServerWebSocket } from 'bun';
import { encodeFrame, OPCODES } from './frames';
import {
  createTerminalSession,
  markTerminalSessionExited,
  markTerminalSessionDestroyed,
} from '@/store/terminal-sessions';
import type { TerminalSessionInfo } from '@jean2/shared';

type BunSubprocess = ReturnType<typeof Bun.spawn>;

interface OutputChunk {
  data: Uint8Array;
  timestamp: number;
}

interface TerminalSession {
  id: string;
  proc: BunSubprocess;
  cwd: string;
  shell: string;
  title: string;
  workspaceId: string;
  clients: Set<ServerWebSocket>;
  cols: number;
  rows: number;
  createdAt: number;
  lastActivityAt: number;
  status: 'running' | 'exited';
  exitCode: number | null;
  buffer: OutputChunk[];
  bufferBytes: number;
}

interface BunTerminal {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

function getTerminal(proc: BunSubprocess): BunTerminal {
  return (proc as unknown as { terminal: BunTerminal }).terminal;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private wsToSessionId = new WeakMap<ServerWebSocket, string>();

  // Keep up to 5 minutes of scrollback for reconnect/refresh
  private static readonly MAX_BUFFER_AGE_MS = 5 * 60 * 1000;
  private static readonly MAX_BUFFER_BYTES = 5 * 1024 * 1024;
  private static readonly MAX_SESSIONS_PER_WORKSPACE = 5;
  private static readonly IDLE_CLEANUP_MS = 30 * 60 * 1000;

  constructor() {
    this.startIdleCleanup();
  }

  createSession(
    ws: ServerWebSocket,
    options: {
      shell?: string;
      cwd: string;
      workspaceId: string;
      cols?: number;
      rows?: number;
    }
  ): string {
    const { cwd, workspaceId, cols = 80, rows = 24 } = options;
    const shell = options.shell || process.env.SHELL || '/bin/bash';

    if (!cwd || !existsSync(cwd)) {
      const errorPayload = new TextEncoder().encode(JSON.stringify({ message: 'Invalid or missing working directory' }));
      ws.send(encodeFrame(OPCODES.ERROR, errorPayload));
      ws.close();
      return '';
    }

    const stat = statSync(cwd);
    if (!stat.isDirectory()) {
      const errorPayload = new TextEncoder().encode(JSON.stringify({ message: 'Path is not a directory' }));
      ws.send(encodeFrame(OPCODES.ERROR, errorPayload));
      ws.close();
      return '';
    }

    const count = this.getActiveSessionCount(cwd);
    if (count >= TerminalManager.MAX_SESSIONS_PER_WORKSPACE) {
      const errorPayload = new TextEncoder().encode(JSON.stringify({
        message: 'Maximum terminal sessions reached for this workspace',
      }));
      ws.send(encodeFrame(OPCODES.ERROR, errorPayload));
      ws.close();
      return '';
    }

    const sessionId = crypto.randomUUID();
    const now = Date.now();

    try {
      const proc = Bun.spawn([shell], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'pipe',
        terminal: {
          cols,
          rows,
          data: (_terminal: unknown, data: Uint8Array) => {
            const session = this.sessions.get(sessionId);
            if (!session || session.status !== 'running') return;

            session.lastActivityAt = Date.now();

            const text = new TextDecoder().decode(data);
            const payload = new TextEncoder().encode(text);

            // Always buffer for scrollback on reconnect
            this.bufferOutput(session, data);

            // Send to all connected clients
            if (session.clients.size > 0) {
              const frame = encodeFrame(OPCODES.OUTPUT, payload);
              const deadClients: ServerWebSocket[] = [];
              for (const client of session.clients) {
                try {
                  client.send(frame);
                } catch {
                  deadClients.push(client);
                }
              }
              for (const dead of deadClients) {
                session.clients.delete(dead);
                this.wsToSessionId.delete(dead);
              }
            }
          },
        },
      } as Parameters<typeof Bun.spawn>[1]);

      const session: TerminalSession = {
        id: sessionId,
        proc,
        cwd,
        shell,
        title: 'main',
        workspaceId,
        clients: new Set([ws]),
        cols,
        rows,
        createdAt: now,
        lastActivityAt: now,
        status: 'running',
        exitCode: null,
        buffer: [],
        bufferBytes: 0,
      };

      this.sessions.set(sessionId, session);
      this.wsToSessionId.set(ws, sessionId);

      createTerminalSession({
        id: sessionId,
        workspaceId,
        cwd,
        shell,
        pid: proc.pid,
        cols,
        rows,
      });

      proc.exited.then((exitCode: number) => {
        const s = this.sessions.get(sessionId);
        if (s) {
          s.status = 'exited';
          s.exitCode = exitCode;
          markTerminalSessionExited(sessionId, exitCode);

          if (s.clients.size > 0) {
            const payload = new TextEncoder().encode(JSON.stringify({ exitCode }));
            const frame = encodeFrame(OPCODES.EXIT, payload);
            for (const client of s.clients) {
              try {
                client.send(frame);
              } catch {
                // WS might be closed
              }
            }
          }
        }
      }).catch(() => {
        const s = this.sessions.get(sessionId);
        if (s) {
          s.status = 'exited';
          s.exitCode = -1;
        }
      });

      return sessionId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorPayload = new TextEncoder().encode(JSON.stringify({ message }));
      ws.send(encodeFrame(OPCODES.ERROR, errorPayload));
      return '';
    }
  }

  reconnectSession(ws: ServerWebSocket, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.wsToSessionId.set(ws, sessionId);
    session.clients.add(ws);

    this.flushBuffer(session, ws);

    if (session.status === 'exited' && session.exitCode !== null) {
      const payload = new TextEncoder().encode(JSON.stringify({ exitCode: session.exitCode }));
      try {
        ws.send(encodeFrame(OPCODES.EXIT, payload));
      } catch {
        // WS might be closed
      }
    }

    return true;
  }

  addClient(ws: ServerWebSocket, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.wsToSessionId.set(ws, sessionId);
    session.clients.add(ws);
    return true;
  }

  removeClient(ws: ServerWebSocket): void {
    const sessionId = this.wsToSessionId.get(ws);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.clients.delete(ws);
    this.wsToSessionId.delete(ws);
  }

  handleInput(ws: ServerWebSocket, data: string): void {
    const sessionId = this.wsToSessionId.get(ws);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;
    try {
      getTerminal(session.proc).write(data);
    } catch {
      // PTY might be closed
    }
  }

  handleResize(ws: ServerWebSocket, cols: number, rows: number): void {
    const sessionId = this.wsToSessionId.get(ws);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;
    try {
      getTerminal(session.proc).resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    } catch {
      // PTY might be closed
    }
  }

  setTitle(sessionId: string, title: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.title = title;
    const payload = new TextEncoder().encode(JSON.stringify({ title }));
    const frame = encodeFrame(OPCODES.TITLE, payload);
    for (const client of session.clients) {
      try {
        client.send(frame);
      } catch {
        // WS might be closed
      }
    }
  }

  destroySession(ws: ServerWebSocket): void {
    const sessionId = this.wsToSessionId.get(ws);
    if (!sessionId) return;
    this.destroySessionById(sessionId);
  }

  destroySessionById(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.proc.kill();
      getTerminal(session.proc).close();
    } catch {
      // Process might already be dead
    }

    for (const client of session.clients) {
      this.wsToSessionId.delete(client);
      try {
        client.close();
      } catch {
        // WS might already be closed
      }
    }

    session.clients.clear();
    this.sessions.delete(sessionId);
    markTerminalSessionDestroyed(sessionId);
  }

  destroyAllSessions(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.destroySessionById(sessionId);
    }
  }

  destroySessionsForWorkspace(workspacePath: string): void {
    for (const [id, session] of this.sessions) {
      if (session.cwd === workspacePath) {
        this.destroySessionById(id);
      }
    }
  }

  getSession(sessionId: string): TerminalSessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      pid: session.proc.pid,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      title: session.title,
      status: session.status,
      exitCode: session.exitCode,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      activeClientCount: session.clients.size,
    };
  }

  listSessionsForWorkspace(workspacePath: string): TerminalSessionInfo[] {
    const result: TerminalSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      if (session.cwd === workspacePath) {
        result.push({
          id: session.id,
          pid: session.proc.pid,
          shell: session.shell,
          cwd: session.cwd,
          cols: session.cols,
          rows: session.rows,
          title: session.title,
          status: session.status,
          exitCode: session.exitCode,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          activeClientCount: session.clients.size,
        });
      }
    }
    return result;
  }

  getActiveSessionCount(workspacePath: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.cwd === workspacePath && session.status === 'running') {
        count++;
      }
    }
    return count;
  }

  getActiveClientCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session?.clients.size ?? 0;
  }

  private bufferOutput(session: TerminalSession, data: Uint8Array): void {
    const now = Date.now();

    this.pruneBuffer(session);

    if (session.bufferBytes + data.length > TerminalManager.MAX_BUFFER_BYTES) {
      while (
        session.buffer.length > 0 &&
        session.bufferBytes + data.length > TerminalManager.MAX_BUFFER_BYTES
      ) {
        const removed = session.buffer.shift()!;
        session.bufferBytes -= removed.data.length;
      }
    }

    session.buffer.push({ data, timestamp: now });
    session.bufferBytes += data.length;
  }

  private flushBuffer(session: TerminalSession, ws: ServerWebSocket): void {
    if (session.buffer.length > 0) {
      console.log(`[TerminalManager] flushBuffer sessionId=${session.id} chunks=${session.buffer.length} bytes=${session.bufferBytes}`);
    }
    for (const chunk of session.buffer) {
      const text = new TextDecoder().decode(chunk.data);
      const payload = new TextEncoder().encode(text);
      try {
        ws.send(encodeFrame(OPCODES.OUTPUT, payload));
      } catch {
        break;
      }
    }
    // Don't clear the buffer — it serves as persistent scrollback for reconnect/refresh.
    // Buffer is naturally pruned by TTL (5 min) and size (5 MB) limits in bufferOutput.
  }

  private pruneBuffer(session: TerminalSession): void {
    const cutoff = Date.now() - TerminalManager.MAX_BUFFER_AGE_MS;
    while (session.buffer.length > 0 && session.buffer[0].timestamp < cutoff) {
      const removed = session.buffer.shift()!;
      session.bufferBytes -= removed.data.length;
    }
  }

  private startIdleCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        const hasNoClients = session.clients.size === 0;
        const isIdle = hasNoClients && session.status === 'running';
        const isStale = session.status === 'exited' && hasNoClients;

        if ((isIdle || isStale) && now - session.lastActivityAt > TerminalManager.IDLE_CLEANUP_MS) {
          this.destroySessionById(id);
        }
      }
    }, 60 * 1000);
  }
}
