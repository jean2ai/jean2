import type { ToolDefinition, ToolContext, ToolResult, SecurityContext, SecurityCheckResult } from '@jean2/sdk';
import type { DiffsVisualization } from '@jean2/sdk';

interface Edit {
  oldString: string;
  newString: string;
  strategy?: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line';
}

interface Input {
  path: string;
  edits: Edit[];
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

const SENSITIVE_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.ssh\//i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.gitconfig$/i,
  /\.npmrc$/i,
  /credentials/i,
  /secrets?/i,
  /password/i,
  /\.htpasswd$/i,
];

const MAX_EDITS_WITHOUT_APPROVAL = 10;

export const definition: ToolDefinition = {
  name: 'multiedit',
  description: `Performs multiple string replacements in a single file atomically.

All edits are applied in sequence - either all succeed or none are applied. Use this instead of multiple edit calls for efficiency and atomicity.

## Parameters

- path (required): Absolute path to the file to edit
- edits (required): Array of edit objects, each containing:
  - oldString (required): The text to find and replace
  - newString (required): The replacement text
  - strategy (optional): Matching strategy to use: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'

## Matching Strategies

1. **exact**: Exact string match
2. **line_start**: Match at the start of a line
3. **line_end**: Match at the end of a line
4. **partial**: Partial/substring match within lines (ignores whitespace differences)
5. **multi_line**: Multi-line pattern matching

## Important

- Edits are applied in order - earlier edits may affect text that later edits try to find
- Plan edits carefully to avoid conflicts between sequential operations
- If any edit fails, none are applied (file remains unchanged)`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to edit',
      },
      edits: {
        type: 'array',
        description: 'Array of edits to apply atomically',
        items: {
          type: 'object',
          properties: {
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
              description: "Matching strategy to use: 'exact' | 'line_start' | 'line_end' | 'partial' | 'multi_line'",
              enum: ['exact', 'line_start', 'line_end', 'partial', 'multi_line'],
            },
          },
          required: ['oldString', 'newString'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  timeout: 180000,
};

export function security(input: Input, ctx: SecurityContext): SecurityCheckResult {
  const normalizedPath = ctx.resolvePath(input.path);

  if (ctx.isBlockedPath(normalizedPath)) {
    return {
      allowed: false,
      requiresApproval: false,
      permissionType: 'action',
      permissionKey: 'path:system_directory',
      message: `Editing system directories is not allowed: ${input.path}`,
    };
  }

  const outsideWorkspace = !ctx.isWithinWorkspace(normalizedPath);
  const sensitive = ctx.isSensitivePath(normalizedPath);
  const excessive = input.edits.length > MAX_EDITS_WITHOUT_APPROVAL;

  if (outsideWorkspace) {
    return {
      allowed: true,
      requiresApproval: true,
      permissionType: 'action',
      permissionKey: 'path:outside_workspace',
      message: 'Editing files outside the workspace requires approval.',
      details: { resolvedPath: normalizedPath },
    };
  }

  if (sensitive) {
    return {
      allowed: true,
      requiresApproval: true,
      permissionType: 'action',
      permissionKey: 'file_pattern:sensitive',
      message: 'Editing sensitive files requires approval.',
      details: { resolvedPath: normalizedPath },
    };
  }

  if (excessive) {
    return {
      allowed: true,
      requiresApproval: true,
      permissionType: 'action',
      permissionKey: 'edit_count:excessive',
      message: `Editing more than ${MAX_EDITS_WITHOUT_APPROVAL} edits at once requires approval.`,
      details: { editCount: input.edits.length },
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    permissionType: 'tool',
    permissionKey: 'tool:multiedit',
    message: 'Editing file within workspace.',
  };
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

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
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
        if (/\s/.test(lines[i][j])) {
          continue;
        }
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

function findMatches(content: string, oldString: string, strategy?: string): { matches: MatchResult[]; usedStrategy: string } {
  const strategies = ['exact', 'line_start', 'line_end', 'partial', 'multi_line'] as const;
  let matches: MatchResult[] = [];
  let usedStrategy = '';

  if (strategy) {
    usedStrategy = strategy;
    switch (strategy) {
      case 'exact':
        matches = exactMatch(content, oldString);
        break;
      case 'line_start':
        matches = lineStartMatch(content, oldString);
        break;
      case 'line_end':
        matches = lineEndMatch(content, oldString);
        break;
      case 'partial':
        matches = partialMatch(content, oldString);
        break;
      case 'multi_line':
        matches = multiLineMatch(content, oldString);
        break;
      default:
        return { matches: [], usedStrategy: '' };
    }
  } else {
    for (const s of strategies) {
      switch (s) {
        case 'exact':
          matches = exactMatch(content, oldString);
          break;
        case 'line_start':
          matches = lineStartMatch(content, oldString);
          break;
        case 'line_end':
          matches = lineEndMatch(content, oldString);
          break;
        case 'partial':
          matches = partialMatch(content, oldString);
          break;
        case 'multi_line':
          matches = multiLineMatch(content, oldString);
          break;
      }

      if (matches.length > 0) {
        usedStrategy = s;
        break;
      }
    }
  }

  return { matches, usedStrategy };
}

function buildDiffVisualization(
  oldContent: string,
  newContent: string,
  filePath: string,
  matchLineNumber: number,
  strategy: string,
  oldString: string,
  newString: string
) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const contextSize = 5;

  const matchIndex = matchLineNumber - 1;
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

  const oldStringLines = oldString.split('\n');
  for (const line of oldStringLines) {
    changes.push({
      type: 'removed',
      content: line,
      oldLineNumber: oldLineNum,
    });
    oldLineNum++;
  }

  const newStringLines = newString.split('\n');
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

  return {
    type: 'diff' as const,
    path: filePath,
    language: detectLanguage(filePath),
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
      strategy,
      lineNumber: matchLineNumber,
    },
  };
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const resolvedPath = ctx.fs.resolve(input.path);

    const exists = await ctx.fs.exists(resolvedPath);
    if (!exists) {
      return { success: false, error: `File not found: ${resolvedPath}` };
    }

    const content = await ctx.fs.readFile(resolvedPath, 'utf-8');

    interface EditRecord {
      oldContent: string;
      newContent: string;
      oldString: string;
      newString: string;
      matchInfo: MatchInfo;
    }
    const editRecords: EditRecord[] = [];
    const results: { matchInfo: MatchInfo }[] = [];

    let contentToEdit = content;

    for (const edit of input.edits) {
      const contentBeforeEdit = contentToEdit;
      const { matches, usedStrategy } = findMatches(contentToEdit, edit.oldString, edit.strategy);

      if (matches.length === 0) {
        return {
          success: false,
          error: `No match found for oldString: ${edit.oldString.substring(0, 50)}...`,
        };
      }

      if (matches.length > 1) {
        return {
          success: false,
          error: `Found ${matches.length} matches for oldString: ${edit.oldString.substring(0, 50)}... Use a more specific oldString or strategy.`,
        };
      }

      const match = matches[0];
      const before = contentToEdit.substring(0, match.startIndex);
      const after = contentToEdit.substring(match.endIndex);
      const newContent = before + edit.newString + after;

      const matchInfo: MatchInfo = {
        strategy: usedStrategy,
        lineNumber: match.lineNumber,
        matchCount: matches.length,
      };

      editRecords.push({
        oldContent: contentBeforeEdit,
        newContent,
        oldString: edit.oldString,
        newString: edit.newString,
        matchInfo,
      });

      results.push({ matchInfo });
      contentToEdit = newContent;
    }

    await ctx.fs.writeFile(resolvedPath, contentToEdit);

    const diffItems = editRecords.map((record) =>
      buildDiffVisualization(
        record.oldContent,
        record.newContent,
        resolvedPath,
        record.matchInfo.lineNumber,
        record.matchInfo.strategy,
        record.oldString,
        record.newString
      )
    );

    const visualization: DiffsVisualization = {
      type: 'diffs',
      items: diffItems,
    };

    return {
      success: true,
      result: { results },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}