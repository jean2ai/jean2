import * as Diff from 'diff';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'added' | 'removed' | 'context';
  content: string;
  lineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  hunks: DiffHunk[];
  path: string;
}

export function generateDiff(
  oldContent: string,
  newContent: string,
  filename: string = 'file'
): DiffResult {
  const patch = Diff.createPatch(filename, oldContent, newContent, '', '');
  const hunks = parsePatch(patch);
  
  return {
    hunks,
    path: filename,
  };
}

function parsePatch(patch: string): DiffHunk[] {
  const lines = patch.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  
  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      oldLineNum = parseInt(hunkHeader[1], 10);
      newLineNum = parseInt(hunkHeader[2], 10);
      currentHunk = {
        oldStart: oldLineNum,
        oldLines: 0,
        newStart: newLineNum,
        newLines: 0,
        changes: [],
      };
      continue;
    }
    
    if (!currentHunk) continue;
    
    if (line.startsWith('+')) {
      currentHunk.changes.push({
        type: 'added',
        content: line.slice(1),
        newLineNumber: newLineNum,
      });
      newLineNum++;
      currentHunk.newLines++;
    } else if (line.startsWith('-')) {
      currentHunk.changes.push({
        type: 'removed',
        content: line.slice(1),
        lineNumber: oldLineNum,
      });
      oldLineNum++;
      currentHunk.oldLines++;
    } else if (line.startsWith(' ')) {
      currentHunk.changes.push({
        type: 'context',
        content: line.slice(1),
        lineNumber: oldLineNum,
        newLineNumber: newLineNum,
      });
      oldLineNum++;
      newLineNum++;
      currentHunk.oldLines++;
      currentHunk.newLines++;
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk);
  }
  
  return hunks;
}

export function generateMultiEditDiff(
  edits: Array<{ oldString: string; newString: string }>
): DiffResult[] {
  return edits.map((edit, index) => 
    generateDiff(edit.oldString, edit.newString, `edit-${index + 1}`)
  );
}
