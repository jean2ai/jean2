export interface TerminalSessionInfo {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  title: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  createdAt: number;
  lastActivityAt: number;
  activeClientCount: number;
}

export interface TerminalSessionInit {
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

export interface TerminalListResponse {
  sessions: TerminalSessionInfo[];
}
