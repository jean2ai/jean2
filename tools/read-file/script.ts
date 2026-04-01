import path from 'node:path';
import os from 'node:os';
import { Buffer } from 'node:buffer';
import { readdir } from 'node:fs/promises';

const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
const MAX_BYTES = 50 * 1024;

const input = JSON.parse(await Bun.stdin.text());
const { path: inputPath, workspacePath, offset, limit, sessionId } = input;

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

async function isBinaryFile(filepath: string, fileSize: number): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase();
  switch (ext) {
    case ".zip":
    case ".tar":
    case ".gz":
    case ".exe":
    case ".dll":
    case ".so":
    case ".class":
    case ".jar":
    case ".war":
    case ".7z":
    case ".doc":
    case ".docx":
    case ".xls":
    case ".xlsx":
    case ".ppt":
    case ".pptx":
    case ".odt":
    case ".ods":
    case ".odp":
    case ".bin":
    case ".dat":
    case ".obj":
    case ".o":
    case ".a":
    case ".lib":
    case ".wasm":
    case ".pyc":
    case ".pyo":
      return true;
    default:
      break;
  }

  if (fileSize === 0) return false;

  const file = Bun.file(filepath);
  const buffer = Buffer.from(await file.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const sampleSize = Math.min(4096, buffer.length);
  
  if (sampleSize === 0) return false;

  let nonPrintableCount = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
    if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
      nonPrintableCount++;
    }
  }
  return nonPrintableCount / sampleSize > 0.3;
}

(async () => {
  try {
    const resolvedPath = resolvePath(inputPath, workspacePath);
    const stat = await Bun.file(resolvedPath).stat();

    if (!stat) {
      console.log(JSON.stringify({ error: `File not found: ${resolvedPath}` }));
      return;
    }

    if (stat.isDirectory()) {
      const entries = await readdir(resolvedPath, { withFileTypes: true });
      const allEntries = entries.filter(e => e.name !== '.' && e.name !== '..');
      
      const markedEntries = allEntries
        .map(e => e.isDirectory() ? e.name + '/' : e.name)
        .sort((a, b) => a.localeCompare(b));
      
      const readLimit = limit ?? DEFAULT_READ_LIMIT;
      const readOffset = offset ?? 1;
      const start = readOffset - 1;
      const sliced = markedEntries.slice(start, start + readLimit);
      const truncated = start + sliced.length < markedEntries.length;
      
      let content = sliced.join('\n');
      if (truncated) {
        content += `\n\n(Showing ${sliced.length} of ${markedEntries.length} entries. Use 'offset' parameter to read beyond entry ${readOffset + sliced.length})`;
      } else {
        content += `\n\n(${markedEntries.length} entries)`;
      }
      
      console.log(JSON.stringify({ 
        content,
        _visualization: {
          type: 'none',
          message: `Read: ${resolvedPath}/`
        }
      }));
      return;
    }

    if (await isBinaryFile(resolvedPath, stat.size)) {
      console.log(JSON.stringify({ error: `Cannot read binary file: ${resolvedPath}` }));
      return;
    }

    const fileContent = await Bun.file(resolvedPath).text();
    const lines = fileContent.split('\n');

    const readLimit = limit ?? DEFAULT_READ_LIMIT;
    const readOffset = offset ?? 1;
    const start = readOffset - 1;

    if (readOffset < 1) {
      console.log(JSON.stringify({ error: "offset must be greater than or equal to 1" }));
      return;
    }

    const outputLines: string[] = [];
    let bytes = 0;

    for (let i = start; i < lines.length && outputLines.length < readLimit; i++) {
      let line = lines[i];
      
      if (line.length > MAX_LINE_LENGTH) {
        line = line.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX;
      }
      
      const lineWithNumber = `${i + 1}: ${line}`;
      const lineSize = Buffer.byteLength(lineWithNumber, 'utf-8') + (outputLines.length > 0 ? 1 : 0);
      
      if (bytes + lineSize > MAX_BYTES) {
        break;
      }
      
      outputLines.push(lineWithNumber);
      bytes += lineSize;
    }

    const content = outputLines.join('\n');
    const totalLines = lines.length;
    const lastReadLine = start + outputLines.length;
    const nextOffset = lastReadLine + 1;
    const truncated = lastReadLine < totalLines;

    let finalContent = content;
    if (truncated) {
      finalContent += `\n\n(Showing lines ${readOffset}-${lastReadLine} of ${totalLines}. Use offset=${nextOffset} to continue.)`;
    } else {
      finalContent += `\n\n(End of file - total ${totalLines} lines)`;
    }

    console.log(JSON.stringify({ 
      content: finalContent,
      _visualization: {
        type: 'none',
        message: `Read: ${resolvedPath}`
      }
    }));
  } catch (e) {
    console.log(JSON.stringify({ error: (e as Error).message }));
  }
})();
