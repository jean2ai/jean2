import { readdir, stat } from 'fs/promises';
import { join, extname, resolve } from 'path';
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

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  
  return entries
    .filter(e => !e.name.startsWith('.'))
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
  limit = 20
): Promise<FileEntry[]> {
  if (!query || query.length < 2) return [];
  
  const pattern = `**/*${query}*`;
  
  const stream = fg.stream([pattern, ...IGNORE_PATTERNS.map(p => `!${p}`)], {
    cwd: rootPath,
    onlyFiles: false,
    suppressErrors: true,
    caseSensitiveMatch: false,
  });
  
  const results: FileEntry[] = [];
  
  for await (const entry of stream) {
    if (results.length >= limit) break;
    
    const entryPath = entry as string;
    const fullPath = join(rootPath, entryPath);
    
    try {
      const stats = await stat(fullPath);
      const name = entryPath.split('/').pop()!;
      
      results.push({
        name,
        type: stats.isDirectory() ? 'directory' as const : 'file' as const,
        path: entryPath,
        extension: stats.isFile() ? extname(entryPath) : undefined,
      });
    } catch {
      // Skip if file disappeared
    }
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
