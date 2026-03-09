import path from 'node:path';
import os from 'node:os';

const input = JSON.parse(await Bun.stdin.text());
const { path: inputPath, content, workspacePath } = input;

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

try {
  const resolvedPath = resolvePath(inputPath, workspacePath);
  await Bun.write(resolvedPath, content);
  console.log(JSON.stringify({ success: true }));
} catch (e) {
  console.log(JSON.stringify({ success: false, error: (e as Error).message }));
}
