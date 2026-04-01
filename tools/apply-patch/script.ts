import path from 'node:path';
import os from 'node:os';

interface ParsedHunk {
  originalStart: number;
  originalCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

interface ParsedFile {
  originalPath: string;
  newPath: string;
  hunks: ParsedHunk[];
}



const input = JSON.parse(await Bun.stdin.text());
const { patch, workspacePath, sessionId } = input;

if (!sessionId || !workspacePath) {
  console.log(JSON.stringify({
    error: 'Missing required sessionId or workspacePath',
  }));
  process.exit(0);
}

function resolvePath(p: string, ws: string): string {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  return path.resolve(ws, p);
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function parseDiffHeader(lines: string[], startIndex: number): { file: ParsedFile; endIndex: number } | null {
  const file: ParsedFile = {
    originalPath: '',
    newPath: '',
    hunks: [],
  };

  let i = startIndex;

  if (i >= lines.length || !lines[i].startsWith('diff --git')) {
    return null;
  }
  i++;

  while (i < lines.length && !lines[i].startsWith('---')) {
    i++;
  }

  if (i >= lines.length) {
    return null;
  }

  const originalLine = lines[i];
  i++;
  if (i >= lines.length || !lines[i].startsWith('+++')) {
    return null;
  }
  const newLine = lines[i];
  i++;

  file.originalPath = originalLine.substring(4);
  if (file.originalPath.startsWith('a/')) {
    file.originalPath = file.originalPath.substring(2);
  }
  file.originalPath = file.originalPath.replace(/\t.*$/, '');

  file.newPath = newLine.substring(4);
  if (file.newPath.startsWith('b/')) {
    file.newPath = file.newPath.substring(2);
  }
  file.newPath = file.newPath.replace(/\t.*$/, '');

  while (i < lines.length) {
    if (lines[i].startsWith('@@')) {
      const hunkMatch = lines[i].match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@(.*)$/);
      if (hunkMatch) {
        const hunk: ParsedHunk = {
          originalStart: parseInt(hunkMatch[1], 10),
          originalCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
          newStart: parseInt(hunkMatch[3], 10),
          newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
          lines: [],
        };

        i++;
        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
          if (lines[i].startsWith('\\ ')) {
            i++;
            continue;
          }
          hunk.lines.push(lines[i]);
          i++;
        }

        file.hunks.push(hunk);
        continue;
      }
    }

    if (lines[i].startsWith('diff --git')) {
      break;
    }

    i++;
  }

  return { file, endIndex: i };
}

function parsePatch(patchContent: string): ParsedFile[] {
  const lines = patchContent.split(/\r?\n/);
  const files: ParsedFile[] = [];
  let i = 0;

  while (i < lines.length) {
    const result = parseDiffHeader(lines, i);
    if (result) {
      files.push(result.file);
      i = result.endIndex;
    } else {
      i++;
    }
  }

  return files;
}

function findBestMatch(
  contentLines: string[],
  contextLines: string[],
  startSearch: number
): { lineNumber: number; matched: boolean } {
  const searchLimit = Math.min(contentLines.length, startSearch + 50);

  for (let offset = 0; offset < 3; offset++) {
    for (let i = Math.max(0, startSearch - 1 + offset); i < searchLimit && i + contextLines.length <= contentLines.length; i++) {
      let match = true;
      for (let j = 0; j < contextLines.length; j++) {
        const contentLine = contentLines[i + j];
        if (!contentLine) {
          match = false;
          break;
        }
        const contentLineNorm = normalizeLine(contentLine);
        const contextLineNorm = normalizeLine(contextLines[j]);
        if (contentLineNorm !== contextLineNorm) {
          match = false;
          break;
        }
      }
      if (match) {
        return { lineNumber: i + 1, matched: true };
      }
    }
  }

  return { lineNumber: -1, matched: false };
}

function applyHunks(content: string, hunks: ParsedHunk[]): string | null {
  let lines = content.split(/\r?\n/);
  let offset = 0;

  for (const hunk of hunks) {
    const contextLines: string[] = [];
    const additions: string[] = [];
    const removals: string[] = [];

    for (const line of hunk.lines) {
      if (!line) continue;
      if (line.startsWith('-')) {
        removals.push(line.substring(1));
        contextLines.push(line.substring(1));
      } else if (line.startsWith('+')) {
        additions.push(line.substring(1));
      } else if (line.startsWith(' ')) {
        contextLines.push(line.substring(1));
      } else if (line.length === 0) {
        contextLines.push('');
      } else if (!line.startsWith('@@') && !line.startsWith('diff') && !line.startsWith('index')) {
        contextLines.push(line);
      }
    }

    const searchStart = Math.max(0, hunk.originalStart - 1 + offset - 5);
    const matchResult = findBestMatch(lines, contextLines, searchStart);

    if (matchResult.lineNumber === -1) {
      return null;
    }

    const matchLineIndex = matchResult.lineNumber - 1;

    let idx = matchLineIndex;
    let contextIdx = 0;
    while (idx < lines.length && contextIdx < contextLines.length) {
      const contentLine = lines[idx];
      if (!contentLine) break;
      const contentNorm = normalizeLine(contentLine);
      const contextNorm = normalizeLine(contextLines[contextIdx] || '');
      if (contentNorm === contextNorm) {
        contextIdx++;
      }
      idx++;
    }
    const removeCount = idx - matchLineIndex;

    const before = lines.slice(0, matchLineIndex);
    const after = lines.slice(matchLineIndex + removeCount);
    lines = [...before, ...additions, ...after];

    offset += additions.length - removeCount;
  }

  return lines.join('\n');
}

async function applyPatch(): Promise<void> {
  try {
    const files = parsePatch(patch);

    if (files.length === 0) {
      console.log(JSON.stringify({ success: false, error: 'No valid patch entries found' }));
      return;
    }

    const appliedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const originalContents: Map<string, string> = new Map();

    for (const file of files) {
      const originalResolvedPath = resolvePath(file.originalPath, workspacePath);
      const newResolvedPath = resolvePath(file.newPath, workspacePath);

      const isNewFile = file.originalPath === '/dev/null' || file.originalPath.startsWith('/dev/null');
      const isDeletedFile = file.newPath === '/dev/null' || file.newPath.startsWith('/dev/null');

      if (isDeletedFile) {
        const fileToDelete = Bun.file(originalResolvedPath);
        const exists = await fileToDelete.exists();

        if (exists) {
          const originalContent = await fileToDelete.text();
          originalContents.set(originalResolvedPath, originalContent);
          await Bun.write(originalResolvedPath, '');
          deletedFiles.push(file.newPath);
        }
        continue;
      }

      if (isNewFile) {
        let newContent = '';
        for (const hunk of file.hunks) {
          for (const line of hunk.lines) {
            if (line.startsWith('+')) {
              newContent += line.substring(1) + '\n';
            }
          }
        }
        newContent = newContent.replace(/\n$/, '');

        await Bun.write(newResolvedPath, newContent);
        createdFiles.push(file.newPath);
        continue;
      }

      const targetFile = Bun.file(originalResolvedPath);
      const exists = await targetFile.exists();

      if (!exists) {
        for (const key of originalContents.keys()) {
          await Bun.write(key, originalContents.get(key)!);
        }
        console.log(JSON.stringify({ success: false, error: `File not found: ${originalResolvedPath}` }));
        return;
      }

      const originalContent = await targetFile.text();
      if (!originalContents.has(originalResolvedPath)) {
        originalContents.set(originalResolvedPath, originalContent);
      }

      const patchedContent = applyHunks(originalContent, file.hunks);

      if (patchedContent === null) {
        for (const key of originalContents.keys()) {
          await Bun.write(key, originalContents.get(key)!);
        }
        console.log(JSON.stringify({ success: false, error: `Failed to apply hunk to file: ${file.originalPath}` }));
        return;
      }

      await Bun.write(originalResolvedPath, patchedContent);
      appliedFiles.push(file.newPath);
    }

    // Build visualization groups
    const groups: Array<{
      label: string;
      files: Array<{ path: string; action: 'created' | 'modified' | 'deleted' }>;
      icon: 'edit' | 'plus' | 'trash';
    }> = [];

    if (appliedFiles.length > 0) {
      groups.push({
        label: 'Modified',
        icon: 'edit',
        files: appliedFiles.map(path => ({ path, action: 'modified' as const })),
      });
    }

    if (createdFiles.length > 0) {
      groups.push({
        label: 'Created',
        icon: 'plus',
        files: createdFiles.map(path => ({ path, action: 'created' as const })),
      });
    }

    if (deletedFiles.length > 0) {
      groups.push({
        label: 'Deleted',
        icon: 'trash',
        files: deletedFiles.map(path => ({ path, action: 'deleted' as const })),
      });
    }

    const total = appliedFiles.length + createdFiles.length + deletedFiles.length;

    console.log(JSON.stringify({
      success: true,
      appliedFiles,
      createdFiles,
      deletedFiles,
      _visualization: {
        type: 'file-list',
        title: `Applied patch to ${total} file${total !== 1 ? 's' : ''}`,
        groups,
        total,
      },
    }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ success: false, error: message }));
  }
}

applyPatch();
