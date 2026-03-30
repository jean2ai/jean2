import path from 'node:path';
import os from 'node:os';

const input = JSON.parse(await Bun.stdin.text());
const { command, cwd: inputCwd, workspacePath } = input;

function resolvePath(p: string, ws: string): string {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  return path.resolve(ws, p);
}

const cwd = inputCwd ? resolvePath(inputCwd, workspacePath) : workspacePath;

let shell: string[];
if (process.platform === 'win32') {
  if (Bun.which('pwsh')) {
    shell = ['pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  } else if (Bun.which('powershell')) {
    shell = ['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command];
  } else {
    shell = ['cmd.exe', '/c', command];
  }
} else {
  shell = ['sh', '-c', command];
}

const result = Bun.spawnSync(shell, {
  cwd,
  maxBuffer: 1024 * 1024 * 10,
  windowsHide: true,
});

console.log(JSON.stringify({
  stdout: result.stdout.toString(),
  stderr: result.stderr.toString(),
  exitCode: result.exitCode,
  _visualization: {
    type: 'shell-output',
    command: command.substring(0, 100),
    stdout: result.stdout.toString() || undefined,
    stderr: result.stderr.toString() || undefined,
    exitCode: result.exitCode,
  }
}));
