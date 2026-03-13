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

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
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
  const file = Bun.file(resolvedPath);
  const existed = await file.exists();

  await Bun.write(resolvedPath, content);

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
  console.log(JSON.stringify({ success: false, error: (e as Error).message }));
}
