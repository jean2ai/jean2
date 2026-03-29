import { readdir } from 'fs/promises';
import { extname, resolve } from 'path';
import fg from 'fast-glob';
import type { FileEntry } from '@jean2/shared';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  '.DS_Store',
  'Thumbs.db',
];

export async function listDirectory(dirPath: string, showHidden = false): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  
  return entries
    .filter(e => showHidden ? e.name !== '.git' : !e.name.startsWith('.'))
    .filter(e => !IGNORE_PATTERNS.some(p => e.name === p.split('/')[0]))
    .map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' as const : 'file' as const,
      path: e.name,
      extension: e.isFile() ? extname(e.name) : undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function searchFiles(
  rootPath: string,
  query: string,
  limit = 20,
  showHidden = false,
  signal?: AbortSignal
): Promise<FileEntry[]> {
  if (!query || query.length < 2) return [];
  if (signal?.aborted) return [];

  const pattern = `**/*${query}*`;

  const ignorePatterns = showHidden 
    ? IGNORE_PATTERNS.filter(p => p.startsWith('.git'))
    : IGNORE_PATTERNS;

  const entries = await fg([pattern, ...ignorePatterns.map(p => `!${p}`)], {
    cwd: rootPath,
    onlyFiles: false,
    suppressErrors: true,
    caseSensitiveMatch: false,
    dot: showHidden,
    markDirectories: true,
  });

  if (signal?.aborted) return [];

  const results: FileEntry[] = [];

  for (const entryPath of entries) {
    if (signal?.aborted) break;
    if (results.length >= limit) break;

    const isDir = entryPath.endsWith('/');
    const cleanPath = isDir ? entryPath.slice(0, -1) : entryPath;
    const name = cleanPath.split('/').pop()!;

    results.push({
      name,
      type: isDir ? 'directory' as const : 'file' as const,
      path: cleanPath,
      extension: isDir ? undefined : extname(cleanPath),
    });
  }

  return results;
}

export function isPathWithinWorkspace(
  targetPath: string,
  workspacePath: string
): boolean {
  const resolved = resolve(targetPath);
  const workspace = resolve(workspacePath);
  return resolved.startsWith(workspace);
}
