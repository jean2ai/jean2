import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { DiffVisualization } from '@jean2/sdk';
import { createFilePermissionAsk, SENSITIVE_FILE_PATTERNS } from '@jean2/sdk';

interface Input {
  path: string;
  oldString: string;
  newString: string;
  strategy?: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line';
}

interface MatchResult {
  lineNumber: number;
  startIndex: number;
  endIndex: number;
}

interface MatchInfo {
  strategy: string;
  lineNumber: number;
  matchCount: number;
}

export const definition: ToolDefinition = {
  name: 'edit',
  description: `Performs string replacements in an existing file.

## When to use

- Making targeted changes to an existing file (adding, modifying, or removing lines)
- Replacing a specific block of code, function, or text
- Applying small, surgical edits without rewriting the entire file

## When NOT to use

- Creating a new file — use write-file instead
- Replacing the entire file content — use write-file instead
- Making many edits to the same file — use multiedit for atomic batch edits
- Applying git-style patches — use apply-patch instead

## Parameters

- path (required): Absolute path to the file to edit
- oldString (required): The text to find and replace. Must be copied VERBATIM from the file — same indentation, quotes, punctuation, and whitespace. Do NOT guess, approximate, or "fix" what you think the text should be. Always read the file first to get the exact content.
- newString (required): The replacement text
- strategy (optional): Matching strategy to use: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'. When omitted, strategies are tried in order automatically.

## Matching Strategies

1. **exact**: Exact string match. The oldString must appear verbatim in the file. This is the default and should be used whenever possible.
2. **line_start**: Match at the start of a line. Use when the text to match starts at the beginning of a line.
3. **line_end**: Match at the end of a line. Use when the text to match ends at the end of a line.
4. **partial**: Partial/substring match that ignores whitespace differences. Use as a fallback when exact indentation is uncertain.
5. **multi_line**: Multi-line pattern matching. Use when oldString spans two or more lines.

## Critical Rules

- **Copy verbatim**: oldString must be an exact substring of the file content — matching character-for-character including all whitespace, indentation, blank lines, and surrounding code.
- **Read first**: Always read the file before editing so you have the exact content to copy.
- **Unique match**: oldString must match exactly one location. If it matches multiple locations or none, the edit will fail. Make oldString specific enough — include enough surrounding context to be unambiguous.
- **No regex**: oldString is a literal string, not a regular expression. Do not use regex patterns.
- **Single edit**: This tool performs one replacement per call. For multiple edits to the same file, use multiedit instead.

## Permission Model

This tool requires explicit permission for:
- Files outside the workspace
- Sensitive files (.env, .pem, .key, credentials, etc.)
- Editing system directories is blocked entirely`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to edit',
      },
      oldString: {
        type: 'string',
        description: 'The text to find and replace',
      },
      newString: {
        type: 'string',
        description: 'The replacement text',
      },
      strategy: {
        type: 'string',
        description: "Matching strategy: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'",
        enum: ['exact', 'line_start', 'line_end', 'partial', 'multi_line'],
      },
    },
    required: ['path', 'oldString', 'newString'],
  },
  timeout: 180000,
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
    go: 'go', rs: 'rust', sh: 'bash', yaml: 'yaml', yml: 'yaml',
  };
  return langMap[ext || ''] || ext || 'text';
}

function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_FILE_PATTERNS.some(p => lower.includes(p));
}

function exactMatch(content: string, search: string): MatchResult[] {
  const results: MatchResult[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let index = 0;
    while ((index = line.indexOf(search, index)) !== -1) {
      const startIndex = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0) + index;
      results.push({
        lineNumber: i + 1,
        startIndex,
        endIndex: startIndex + search.length,
      });
      index += search.length;
    }
  }

  return results;
}

function lineStartMatch(content: string, search: string): MatchResult[] {
  const results: MatchResult[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(search)) {
      const startIndex = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      results.push({
        lineNumber: i + 1,
        startIndex,
        endIndex: startIndex + search.length,
      });
    }
  }

  return results;
}

function lineEndMatch(content: string, search: string): MatchResult[] {
  const results: MatchResult[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith(search)) {
      const lineStartIndex = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const startIndex = lineStartIndex + lines[i].length - search.length;
      results.push({
        lineNumber: i + 1,
        startIndex,
        endIndex: startIndex + search.length,
      });
    }
  }

  return results;
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

function partialMatch(content: string, search: string): MatchResult[] {
  const results: MatchResult[] = [];
  const normalizedSearch = normalizeWhitespace(search);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const normalizedLine = normalizeWhitespace(lines[i]);
    if (normalizedLine.includes(normalizedSearch)) {
      const lineStartIndex = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const matchStartInNormalized = normalizedLine.indexOf(normalizedSearch);
      let charCount = 0;
      let actualStart = lineStartIndex;

      let searchIdx = 0;
      for (let j = 0; j < lines[i].length && searchIdx < normalizedSearch.length; j++) {
        if (/\s/.test(lines[i][j])) continue;
        if (lines[i][j] === normalizedSearch[searchIdx] || normalizedSearch[searchIdx] === ' ') {
          if (charCount === matchStartInNormalized) {
            actualStart = lineStartIndex + j;
          }
          if (lines[i][j] === normalizedSearch[searchIdx]) {
            searchIdx++;
          }
        }
        charCount++;
      }

      results.push({
        lineNumber: i + 1,
        startIndex: actualStart,
        endIndex: actualStart + search.length,
      });
    }
  }

  return results;
}

function multiLineMatch(content: string, search: string): MatchResult[] {
  const results: MatchResult[] = [];
  const searchLines = search.split('\n');

  if (searchLines.length < 2) {
    return exactMatch(content, search);
  }

  const contentLines = content.split('\n');

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    let startIndex = 0;
    let endIndex = 0;

    for (let j = 0; j < searchLines.length; j++) {
      const contentLine = normalizeWhitespace(contentLines[i + j]);
      const searchLine = normalizeWhitespace(searchLines[j]);

      if (!contentLine.includes(searchLine)) {
        match = false;
        break;
      }

      if (j === 0) {
        const idx = contentLines[i + j].indexOf(searchLines[j]);
        const lineStartIndex = content.split('\n').slice(0, i + j).join('\n').length + (i + j > 0 ? 1 : 0);
        startIndex = lineStartIndex + idx;
      }

      if (j === searchLines.length - 1) {
        const idx = contentLines[i + j].indexOf(searchLines[j]);
        const lineStartIndex = content.split('\n').slice(0, i + j).join('\n').length + (i + j > 0 ? 1 : 0);
        endIndex = lineStartIndex + idx + searchLines[j].length;
      }
    }

    if (match) {
      results.push({
        lineNumber: i + 1,
        startIndex,
        endIndex,
      });
    }
  }

  return results;
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const resolvedPath = ctx.resolvePath(input.path);

    if (ctx.isBlockedPath(resolvedPath)) {
      return { success: false, error: `Editing system directories is not allowed: ${input.path}` };
    }

    // Permission check for outside workspace and sensitive files
    const outsideWorkspace = !ctx.isWithinWorkspace(resolvedPath);
    const sensitive = isSensitivePath(resolvedPath);

    // Outside workspace permission ask
    if (outsideWorkspace) {
      const permAsk = createFilePermissionAsk({
        path: input.path,
        operation: 'edit',
        risk: 'medium',
        isOutsideWorkspace: true,
      });

      const approved = await ctx.ask(permAsk);
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    // Sensitive file permission ask (separate ask for clarity)
    if (sensitive) {
      const permAsk = createFilePermissionAsk({
        path: input.path,
        operation: 'edit',
        risk: 'medium',
        isSensitiveFile: true,
        reason: 'This file may contain credentials or secrets.',
      });

      const approved = await ctx.ask(permAsk);
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const exists = await ctx.fs.exists(resolvedPath);
    if (!exists) {
      return { success: false, error: `File not found: ${resolvedPath}` };
    }

    const content = await ctx.fs.readFile(resolvedPath, 'utf-8');

    const strategies = ['exact', 'line_start', 'line_end', 'partial', 'multi_line'] as const;
    let matches: MatchResult[] = [];
    let usedStrategy = '';

    if (input.strategy) {
      usedStrategy = input.strategy;
      switch (input.strategy) {
        case 'exact':
          matches = exactMatch(content, input.oldString);
          break;
        case 'line_start':
          matches = lineStartMatch(content, input.oldString);
          break;
        case 'line_end':
          matches = lineEndMatch(content, input.oldString);
          break;
        case 'partial':
          matches = partialMatch(content, input.oldString);
          break;
        case 'multi_line':
          matches = multiLineMatch(content, input.oldString);
          break;
        default:
          return { success: false, error: `Unknown strategy: ${input.strategy}` };
      }

      if (matches.length === 0) {
        return { success: false, error: `Strategy '${input.strategy}' found no match` };
      }
    } else {
      for (const s of strategies) {
        switch (s) {
          case 'exact':
            matches = exactMatch(content, input.oldString);
            break;
          case 'line_start':
            matches = lineStartMatch(content, input.oldString);
            break;
          case 'line_end':
            matches = lineEndMatch(content, input.oldString);
            break;
          case 'partial':
            matches = partialMatch(content, input.oldString);
            break;
          case 'multi_line':
            matches = multiLineMatch(content, input.oldString);
            break;
        }

        if (matches.length > 0) {
          usedStrategy = s;
          break;
        }
      }
    }

    if (matches.length === 0) {
      return { success: false, error: 'No match found for oldString in file' };
    }

    if (matches.length > 1) {
      return {
        success: false,
        error: `Found ${matches.length} matches. Please provide a more specific oldString or use strategy parameter.`,
      };
    }

    const match = matches[0];
    const before = content.substring(0, match.startIndex);
    const after = content.substring(match.endIndex);
    const newContent = before + input.newString + after;

    await ctx.fs.writeFile(resolvedPath, newContent);

    const matchInfo: MatchInfo = {
      strategy: usedStrategy,
      lineNumber: match.lineNumber,
      matchCount: matches.length,
    };

    const oldLines = content.split('\n');
    const contextSize = 5;

    const matchIndex = match.lineNumber - 1;
    const contextStart = Math.max(0, matchIndex - contextSize);

    type DiffChange = { type: 'added' | 'removed' | 'context'; content: string; oldLineNumber?: number; newLineNumber?: number };
    const changes: DiffChange[] = [];
    let oldLineNum = contextStart + 1;
    let newLineNum = contextStart + 1;

    for (let i = contextStart; i < matchIndex; i++) {
      changes.push({
        type: 'context',
        content: oldLines[i] || '',
        oldLineNumber: oldLineNum,
        newLineNumber: newLineNum,
      });
      oldLineNum++;
      newLineNum++;
    }

    const oldStringLines = input.oldString.split('\n');
    for (const line of oldStringLines) {
      changes.push({
        type: 'removed',
        content: line,
        oldLineNumber: oldLineNum,
      });
      oldLineNum++;
    }

    const newStringLines = input.newString.split('\n');
    for (const line of newStringLines) {
      changes.push({
        type: 'added',
        content: line,
        newLineNumber: newLineNum,
      });
      newLineNum++;
    }

    const afterStart = matchIndex + oldStringLines.length;
    const afterEnd = Math.min(oldLines.length, afterStart + contextSize);
    for (let i = afterStart; i < afterEnd; i++) {
      changes.push({
        type: 'context',
        content: oldLines[i] || '',
        oldLineNumber: oldLineNum,
        newLineNumber: newLineNum,
      });
      oldLineNum++;
      newLineNum++;
    }

    const visualization: DiffVisualization = {
      type: 'diff',
      path: resolvedPath,
      language: detectLanguage(resolvedPath),
      hunks: [{
        oldStart: contextStart + 1,
        oldLines: oldLineNum - contextStart - 1,
        newStart: contextStart + 1,
        newLines: newLineNum - contextStart - 1,
        changes,
      }],
      additions: newStringLines.length,
      deletions: oldStringLines.length,
      matchInfo: {
        strategy: usedStrategy,
        lineNumber: match.lineNumber,
      },
    };

    return {
      success: true,
      result: { matchInfo },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
