import path from 'node:path';
import os from 'node:os';

interface DiffChange {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
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
  const _newLines = newContent.split('\n');
  const contextSize = 5;
  
  const matchIndex = matchLineNumber - 1;
  const contextStart = Math.max(0, matchIndex - contextSize);
  
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
  
  const hunks: DiffHunk[] = [{
    oldStart: contextStart + 1,
    oldLines: oldLineNum - contextStart - 1,
    newStart: contextStart + 1,
    newLines: newLineNum - contextStart - 1,
    changes,
  }];
  
  return {
    type: 'diff' as const,
    path: filePath,
    language: detectLanguage(filePath),
    hunks,
    additions: newStringLines.length,
    deletions: oldStringLines.length,
    matchInfo: {
      strategy,
      lineNumber: matchLineNumber,
    },
  };
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

interface _Edit {
  oldString: string;
  newString: string;
  strategy?: string;
}

const input = JSON.parse(await Bun.stdin.text());
const { path: inputPath, edits, workspacePath, sessionId } = input;

if (!sessionId || !workspacePath) {
  console.log(JSON.stringify({
    error: 'Missing required sessionId or workspacePath',
  }));
  return;
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

async function multiEditFile() {
  try {
    const resolvedPath = resolvePath(inputPath, workspacePath);
    const file = Bun.file(resolvedPath);
    
    const exists = await file.exists();
    if (!exists) {
      console.log(JSON.stringify({ success: false, error: `File not found: ${resolvedPath}` }));
      return;
    }
    
    let content = await file.text();
    
    // Track each edit's details for building diffs later
    interface EditRecord {
      oldContent: string;
      newContent: string;
      oldString: string;
      newString: string;
      matchInfo: MatchInfo;
    }
    const editRecords: EditRecord[] = [];
    const results: { matchInfo: MatchInfo }[] = [];
    
    for (const edit of edits) {
      const contentBeforeEdit = content; // Track content before this edit
      const { matches, usedStrategy } = findMatches(content, edit.oldString, edit.strategy);
      
      if (matches.length === 0) {
        console.log(JSON.stringify({
          success: false,
          error: `No match found for oldString: ${edit.oldString.substring(0, 50)}...`,
        }));
        return;
      }
      
      if (matches.length > 1) {
        console.log(JSON.stringify({
          success: false,
          error: `Found ${matches.length} matches for oldString: ${edit.oldString.substring(0, 50)}... Use a more specific oldString or strategy.`,
        }));
        return;
      }
      
      const match = matches[0];
      const before = content.substring(0, match.startIndex);
      const after = content.substring(match.endIndex);
      const newContent = before + edit.newString + after;
      
      const matchInfo: MatchInfo = {
        strategy: usedStrategy,
        lineNumber: match.lineNumber,
        matchCount: matches.length,
      };
      
      // Store the edit record for building diff visualization
      editRecords.push({
        oldContent: contentBeforeEdit,
        newContent,
        oldString: edit.oldString,
        newString: edit.newString,
        matchInfo,
      });
      
      results.push({ matchInfo });
      content = newContent;
    }
    
    await Bun.write(resolvedPath, content);

    // Build diff visualizations for each edit
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

    const response: {
      success: boolean;
      results: { matchInfo: MatchInfo }[];
      _visualization?: { type: 'diffs'; items: ReturnType<typeof buildDiffVisualization>[] };
    } = {
      success: true,
      results,
      _visualization: {
        type: 'diffs',
        items: diffItems,
      },
    };

    console.log(JSON.stringify(response));
  } catch (e) {
    const errorMessage = (e as Error).message;
    console.log(JSON.stringify({ success: false, error: errorMessage }));
  }
}

multiEditFile();
