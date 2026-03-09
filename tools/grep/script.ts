import path from 'node:path';
import os from 'node:os';

const input = JSON.parse(await Bun.stdin.text());
const { pattern, path: inputPath, _include, workspacePath } = input;

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

// Resolve the search path, default to workspacePath
const searchPath = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;

// Simple grep implementation using ripgrep if available, otherwise fallback
const result = Bun.spawnSync(['rg', '-n', '--json', pattern, searchPath], {
  maxBuffer: 1024 * 1024 * 10,
});

const matches: Array<{ file: string; line: number; content: string }> = [];

if (result.exitCode === 0) {
  const lines = result.stdout.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'match') {
        for (const match of parsed.data.matches) {
          matches.push({
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            content: match.text,
          });
        }
      }
    } catch {
      // Skip non-JSON lines from ripgrep output
    }
  }
}

console.log(JSON.stringify({ matches }));
