import path from 'node:path';
import os from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';

const input = JSON.parse(await Bun.stdin.text());
const { pattern, path: inputPath, include, workspacePath, sessionId } = input;

const MAX_OUTPUT_CHARS = 50_000;
const JEAN2_TEMP_PREFIX = '/tmp/jean2/';

function resolvePath(p: string, ws: string): string {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  return path.resolve(ws, p);
}

const searchPath = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;

const rgArgs = ['rg', '-n', '--json'];
if (include) {
  rgArgs.push('--glob', include);
}
rgArgs.push(pattern, searchPath);

const result = Bun.spawnSync(rgArgs, {
  stderr: 'pipe',
});

const matches: Array<{ file: string; line: number; content: string }> = [];

if (result.exitCode === 0) {
  const lines = result.stdout.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'match') {
        matches.push({
          file: parsed.data.path.text,
          line: parsed.data.line_number,
          content: parsed.data.lines.text.trimEnd(),
        });
      }
    } catch {
      // Skip non-JSON lines from ripgrep output
    }
  }
} else if (result.exitCode >= 2) {
  const errorMsg = result.stderr?.toString().trim() || 'ripgrep error';
  console.log(JSON.stringify({
    matches: [],
    error: errorMsg,
    _visualization: {
      type: 'none',
      content: `Grep error: ${errorMsg}`,
    },
  }));
  process.exit(0);
}

const fullOutput = JSON.stringify({ matches });

if (fullOutput.length > MAX_OUTPUT_CHARS && sessionId) {
  const dir = `${JEAN2_TEMP_PREFIX}${sessionId}`;
  mkdirSync(dir, { recursive: true });
  const filePath = `${dir}/grep-${Date.now()}.json`;
  writeFileSync(filePath, fullOutput);

  console.log(JSON.stringify({
    matches: matches.slice(0, 50),
    totalMatches: matches.length,
    _persisted: true,
    _filePath: filePath,
    _originalSize: fullOutput.length,
    _visualization: {
      type: 'none',
      content: `Grep: "${pattern}" (${matches.length} matches, persisted)`,
    },
  }));
} else {
  console.log(JSON.stringify({
    matches,
    _visualization: {
      type: 'none',
      content: `Grep: "${pattern}" (${matches.length} matches)`,
    },
  }));
}
