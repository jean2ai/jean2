import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const inputText = await (() => {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
})();

const input = JSON.parse(inputText);
const { command, cwd: inputCwd, workspacePath, sessionId } = input;

if (!sessionId || !workspacePath) {
  console.log(JSON.stringify({
    error: 'Missing required sessionId or workspacePath',
  }));
  process.exit(0);
}

function resolvePath(p, ws) {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  return path.resolve(ws, p);
}

const cwd = inputCwd ? resolvePath(inputCwd, workspacePath) : workspacePath;

function whichCommand(cmd) {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const pathDirs = process.env.PATH?.split(pathSep) || [];
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    if (existsSync(fullPath)) return true;
  }
  return false;
}

let shell;
if (process.platform === 'win32') {
  if (whichCommand('pwsh')) {
    shell = ['pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  } else if (whichCommand('powershell')) {
    shell = ['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  } else {
    shell = ['cmd.exe', '/c', command];
  }
} else {
  shell = ['sh', '-c', command];
}

const result = spawnSync(shell[0], shell.slice(1), {
  cwd,
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true,
  encoding: 'utf-8',
});

console.log(JSON.stringify({
  stdout: result.stdout ? result.stdout.toString() : '',
  stderr: result.stderr ? result.stderr.toString() : '',
  exitCode: result.status,
  _visualization: {
    type: 'shell-output',
    command: command.substring(0, 100),
    stdout: result.stdout ? result.stdout.toString() : undefined,
    stderr: result.stderr ? result.stderr.toString() : undefined,
    exitCode: result.status,
  }
}));
