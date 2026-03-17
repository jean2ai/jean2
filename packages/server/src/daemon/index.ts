import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from 'fs';

import { getPort, getHost } from '../config';
import { getToolEnv } from '../env';

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  port?: number;
  host?: string;
  startedAt?: string;
}

export interface DaemonOptions {
  port?: number;
  host?: string;
}

export interface DaemonResult {
  success: boolean;
  pid?: number;
  error?: string;
}

interface PidFileData {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

function getConfigDir(): string {
  return join(homedir(), '.jean2');
}

export function getPidFilePath(): string {
  return join(getConfigDir(), 'server.pid');
}

export function getLogFilePath(): string {
  return join(getConfigDir(), 'server.log');
}

function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

function readPidFile(): PidFileData | null {
  const pidFilePath = getPidFilePath();
  if (!existsSync(pidFilePath)) {
    return null;
  }

  try {
    const content = readFileSync(pidFilePath, 'utf-8');
    return JSON.parse(content) as PidFileData;
  } catch {
    return null;
  }
}

function writePidFile(data: { pid: number; port: number; host: string }): void {
  const pidFilePath = getPidFilePath();
  const dataWithTimestamp: PidFileData = {
    ...data,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(pidFilePath, JSON.stringify(dataWithTimestamp, null, 2));
}

function removePidFile(): void {
  const pidFilePath = getPidFilePath();
  if (existsSync(pidFilePath)) {
    unlinkSync(pidFilePath);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function startDaemon(options?: DaemonOptions): Promise<DaemonResult> {
  const status = getStatus();

  if (status.running) {
    return {
      success: false,
      error: `Daemon already running with PID ${status.pid}`,
    };
  }

  const port = options?.port ?? getPort();
  const host = options?.host ?? getHost();

  ensureConfigDir();

  const logFilePath = getLogFilePath();
  const logFd = openSync(logFilePath, 'a');

  const isCompiled = !process.argv[1]?.endsWith('.ts');

  let child: ReturnType<typeof Bun.spawn<"ignore", number, number>>;

  if (isCompiled) {
    const binaryPath = process.execPath;
    child = Bun.spawn(
      [binaryPath, 'server', '--port', String(port), '--host', host],
      {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...getToolEnv(),
          JEAN2_PORT: String(port),
          JEAN2_HOST: host,
        },
      }
    );
  } else {
    const scriptPath = process.argv[1] || join(process.cwd(), 'packages/server/src/index.ts');
    child = Bun.spawn(
      ['bun', 'run', scriptPath, 'server', '--port', String(port), '--host', host],
      {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...getToolEnv(),
          JEAN2_PORT: String(port),
          JEAN2_HOST: host,
        },
      }
    );
  }

  const pid = child.pid;

  if (!pid) {
    return {
      success: false,
      error: 'Failed to spawn daemon process',
    };
  }

  writePidFile({ pid, port, host });

  child.unref();

  console.log(`Daemon started with PID ${pid}`);
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Logs: ${logFilePath}`);

  return { success: true, pid };
}

export async function stopDaemon(): Promise<DaemonResult> {
  const pidData = readPidFile();

  if (!pidData) {
    return {
      success: false,
      error: 'Daemon not running',
    };
  }

  const { pid } = pidData;

  if (!isProcessAlive(pid)) {
    removePidFile();
    return {
      success: false,
      error: 'Daemon process not found (stale PID file)',
    };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    removePidFile();
    return {
      success: false,
      error: `Failed to send SIGTERM: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const maxWaitMs = 5000;
  const pollIntervalMs = 100;
  let waitedMs = 0;

  while (waitedMs < maxWaitMs) {
    if (!isProcessAlive(pid)) {
      removePidFile();
      console.log(`Daemon stopped (PID ${pid})`);
      return { success: true, pid };
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    waitedMs += pollIntervalMs;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (err) {
    removePidFile();
    return {
      success: false,
      error: `Failed to send SIGKILL: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!isProcessAlive(pid)) {
    removePidFile();
    console.log(`Daemon forcefully stopped (PID ${pid})`);
    return { success: true, pid };
  }

  removePidFile();
  return {
    success: false,
    error: 'Failed to stop daemon even with SIGKILL',
  };
}

export async function restartDaemon(options?: DaemonOptions): Promise<DaemonResult> {
  const stopResult = await stopDaemon();

  if (!stopResult.success && stopResult.error !== 'Daemon not running') {
    return stopResult;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  return startDaemon(options);
}

export function getStatus(): DaemonStatus {
  const pidData = readPidFile();

  if (!pidData) {
    return { running: false };
  }

  const { pid, port, host, startedAt } = pidData;

  if (!isProcessAlive(pid)) {
    removePidFile();
    return { running: false };
  }

  return {
    running: true,
    pid,
    port,
    host,
    startedAt,
  };
}

export function tailLogs(): void {
  const logFilePath = getLogFilePath();

  if (!existsSync(logFilePath)) {
    console.log(`Log file does not exist: ${logFilePath}`);
    console.log('The daemon must be started first to create the log file.');
    return;
  }

  const tailProcess = Bun.spawn(['tail', '-f', logFilePath], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  tailProcess.unref();
}
