import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { FileListVisualization } from '@jean2/sdk';

interface Input {
  patch: string;
}

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

export const definition: ToolDefinition = {
  name: 'apply-patch',
  description: `Apply unified diff patches to files atomically.

Parses standard unified diff format (git diff output) and applies changes to multiple files. Handles file creation, modification, and deletion.

## When to use

- Applying patches from external sources
- Batch file modifications from diff output

## Parameters

- patch (required): The unified diff patch content to apply (standard git diff format)

## Patch format example

\`\`\`
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-old line
+new line
\`\`\`

## Returns

Lists of applied, created, and deleted files.`,
  inputSchema: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'The unified diff patch content to apply (standard git diff format)',
      },
    },
    required: ['patch'],
  },
  timeout: 60000,
};

function parseFilePathsFromPatch(patchContent: string): { originalPath: string; newPath: string; isDeletion: boolean }[] {
  const results: { originalPath: string; newPath: string; isDeletion: boolean }[] = [];
  const lines = patchContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('---')) {
      const originalLine = lines[i];
      const newLine = lines[i + 1]?.startsWith('+++') ? lines[i + 1] : '';

      let originalPath = originalLine.substring(4).trim();
      let newPath = newLine.substring(4).trim();

      if (originalPath.startsWith('a/')) originalPath = originalPath.substring(2);
      if (newPath.startsWith('b/')) newPath = newPath.substring(2);

      originalPath = originalPath.split('\t')[0];
      newPath = newPath.split('\t')[0];

      const isDeletion = newPath === '/dev/null' || newPath.startsWith('/dev/null');
      const isCreation = originalPath === '/dev/null' || originalPath.startsWith('/dev/null');

      if (!isCreation) {
        results.push({ originalPath, newPath, isDeletion });
      } else if (isCreation && newPath !== '/dev/null') {
        results.push({ originalPath: newPath, newPath, isDeletion: false });
      }
    }
  }

  return results;
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

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const parsedFiles = parseFilePathsFromPatch(input.patch);

    if (parsedFiles.length === 0) {
      return { success: false, error: 'No valid file paths found in patch' };
    }

    const blockedFiles: string[] = [];
    const outsideWorkspaceFiles: { path: string; resolvedPath: string }[] = [];
    const sensitiveFiles: string[] = [];
    const deletionFiles: string[] = [];

    for (const file of parsedFiles) {
      const checkPath = file.newPath || file.originalPath;
      const resolvedPath = ctx.resolvePath(checkPath);

      if (file.isDeletion) {
        deletionFiles.push(file.originalPath);
        continue;
      }

      if (ctx.isBlockedPath(resolvedPath)) {
        blockedFiles.push(checkPath);
        continue;
      }

      if (!ctx.isWithinWorkspace(resolvedPath)) {
        outsideWorkspaceFiles.push({ path: checkPath, resolvedPath });
      }

      if (ctx.isSensitivePath(resolvedPath)) {
        sensitiveFiles.push(checkPath);
      }
    }

    if (blockedFiles.length > 0) {
      return { success: false, error: `Cannot apply patch to system directories: ${blockedFiles.join(', ')}` };
    }

    if (outsideWorkspaceFiles.length > 0) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Applying patch to files outside the workspace requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'path:outside_workspace', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    } else if (sensitiveFiles.length > 0) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Applying patch to sensitive files requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'file_pattern:sensitive', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    } else if (deletionFiles.length > 0) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Applying patch that deletes files requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'file:deletion', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const files = parsePatch(input.patch);

    if (files.length === 0) {
      return { success: false, error: 'No valid patch entries found' };
    }

    const appliedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const originalContents: Map<string, string> = new Map();

    for (const file of files) {
      const originalResolvedPath = ctx.fs.resolve(file.originalPath);
      const newResolvedPath = ctx.fs.resolve(file.newPath);

      const isNewFile = file.originalPath === '/dev/null' || file.originalPath.startsWith('/dev/null');
      const isDeletedFile = file.newPath === '/dev/null' || file.newPath.startsWith('/dev/null');

      if (isDeletedFile) {
        const exists = await ctx.fs.exists(originalResolvedPath);

        if (exists) {
          const originalContent = await ctx.fs.readFile(originalResolvedPath, 'utf-8');
          originalContents.set(originalResolvedPath, originalContent);
          await ctx.fs.writeFile(originalResolvedPath, '');
          deletedFiles.push(file.originalPath);
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

        await ctx.fs.writeFile(newResolvedPath, newContent);
        createdFiles.push(file.newPath);
        continue;
      }

      const exists = await ctx.fs.exists(originalResolvedPath);

      if (!exists) {
        for (const key of originalContents.keys()) {
          await ctx.fs.writeFile(key, originalContents.get(key)!);
        }
        return { success: false, error: `File not found: ${originalResolvedPath}` };
      }

      const originalContent = await ctx.fs.readFile(originalResolvedPath, 'utf-8');
      if (!originalContents.has(originalResolvedPath)) {
        originalContents.set(originalResolvedPath, originalContent);
      }

      const patchedContent = applyHunks(originalContent, file.hunks);

      if (patchedContent === null) {
        for (const key of originalContents.keys()) {
          await ctx.fs.writeFile(key, originalContents.get(key)!);
        }
        return { success: false, error: `Failed to apply hunk to file: ${file.originalPath}` };
      }

      await ctx.fs.writeFile(originalResolvedPath, patchedContent);
      appliedFiles.push(file.newPath);
    }

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

    const visualization: FileListVisualization = {
      type: 'file-list',
      title: `Applied patch to ${total} file${total !== 1 ? 's' : ''}`,
      groups,
      total,
    };

    return {
      success: true,
      result: { appliedFiles, createdFiles, deletedFiles },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}