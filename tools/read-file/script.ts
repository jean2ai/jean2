import path from 'node:path';
import os from 'node:os';

const input = JSON.parse(await Bun.stdin.text());
const { path: inputPath, workspacePath } = input;

/**
 * Resolve path using standard Node.js APIs
 * NO Jean2 dependencies - this is standalone
 */
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
  const content = await Bun.file(resolvedPath).text();
  console.log(JSON.stringify({ content }));
} catch (e) {
  console.log(JSON.stringify({ error: (e as Error).message }));
}
