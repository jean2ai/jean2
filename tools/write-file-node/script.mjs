import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

const input = JSON.parse(await readStdin());
const { path: inputPath, content, workspacePath, sessionId } = input;

if (!sessionId || !workspacePath) {
  console.log(JSON.stringify({
    error: 'Missing required sessionId or workspacePath',
  }));
  process.exit(0);
}

function resolvePath(p, ws) {
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

function detectLanguage(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext || ''] || ext || 'text';
}

try {
  const resolvedPath = resolvePath(inputPath, workspacePath);
  const existed = existsSync(resolvedPath);

  await writeFile(resolvedPath, content);

  const lineCount = content.split('\n').length;

  console.log(JSON.stringify({
    success: true,
    path: resolvedPath,
    bytes: content.length,
    _visualization: {
      type: 'code',
      path: resolvedPath,
      content,
      language: detectLanguage(resolvedPath),
      created: !existed,
      lineCount,
    },
  }));
} catch (e) {
  console.log(JSON.stringify({ success: false, error: e.message }));
}
