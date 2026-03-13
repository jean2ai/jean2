import path from 'node:path';
import os from 'node:os';

const input = JSON.parse(await Bun.stdin.text());
const { command, cwd: inputCwd, workspacePath } = input;

function resolvePath(p: string, ws: string): string {
  // Expand home directory
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  // If absolute, return as-is
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  // If relative, join with workspace
  return path.resolve(ws, p);
}

// Resolve cwd, default to workspacePath
const cwd = inputCwd ? resolvePath(inputCwd, workspacePath) : workspacePath;

const result = Bun.spawnSync(['sh', '-c', command], {
  cwd,
  maxBuffer: 1024 * 1024 * 10,
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
