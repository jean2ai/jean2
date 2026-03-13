import path from 'node:path';
import os from 'node:os';

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

interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: 'Error' | 'Warning' | 'Information' | 'Hint';
  message: string;
  code?: string | number;
  source?: string;
}

const input = JSON.parse(await Bun.stdin.text());
const { path: inputPath, oldString, newString, strategy, workspacePath } = input;

function resolvePath(p: string, ws: string): string {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  return path.resolve(ws, p);
}

function isLspSupportedFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'].includes(ext || '');
}

async function fetchDiagnostics(filePath: string, serverUrl: string): Promise<Diagnostic[] | null> {
  try {
    const response = await fetch(`${serverUrl}/api/lsp/diagnostics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: filePath }),
    });

    if (!response.ok) return null;

    const data = await response.json() as { success: boolean; result?: Diagnostic[] };
    return data.success && data.result ? data.result : null;
  } catch {
    return null;
  }
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

async function editFile() {
  try {
    const resolvedPath = resolvePath(inputPath, workspacePath);
    const file = Bun.file(resolvedPath);
    
    const exists = await file.exists();
    if (!exists) {
      console.log(JSON.stringify({ success: false, error: `File not found: ${resolvedPath}` }));
      return;
    }
    
    const content = await file.text();
    
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
          console.log(JSON.stringify({ success: false, error: `Unknown strategy: ${strategy}` }));
          return;
      }
      
      if (matches.length === 0) {
        console.log(JSON.stringify({ success: false, error: `Strategy '${strategy}' found no match` }));
        return;
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
    
    if (matches.length === 0) {
      console.log(JSON.stringify({ success: false, error: 'No match found for oldString in file' }));
      return;
    }
    
    if (matches.length > 1) {
      console.log(JSON.stringify({
        success: false,
        error: `Found ${matches.length} matches. Please provide a more specific oldString or use strategy parameter.`,
      }));
      return;
    }
    
    const match = matches[0];
    const before = content.substring(0, match.startIndex);
    const after = content.substring(match.endIndex);
    const newContent = before + newString + after;
    
    await Bun.write(resolvedPath, newContent);

    // Fetch diagnostics for supported files after successful edit
    let diagnostics: Diagnostic[] | undefined;
    if (isLspSupportedFile(resolvedPath)) {
      const serverUrl = process.env.JEAN2_SERVER_URL || 'http://localhost:3000';
      // Small delay to let LSP process the change
      await new Promise(resolve => setTimeout(resolve, 150));
      diagnostics = await fetchDiagnostics(resolvedPath, serverUrl) || undefined;
    }

    const matchInfo: MatchInfo = {
      strategy: usedStrategy,
      lineNumber: match.lineNumber,
      matchCount: matches.length,
    };

    // Only include diagnostics if there are any (especially errors/warnings)
    const response: { success: boolean; matchInfo: MatchInfo; diagnostics?: Diagnostic[] } = {
      success: true,
      matchInfo,
    };

    if (diagnostics && diagnostics.length > 0) {
      response.diagnostics = diagnostics;
    }

    console.log(JSON.stringify(response));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: (e as Error).message }));
  }
}

editFile();
