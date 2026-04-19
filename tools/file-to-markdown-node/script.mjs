import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { convertToMarkdown } from 'filetomarkdown';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
const MAX_BYTES = 50 * 1024;
const JEAN2_TEMP_PREFIX = path.join(os.tmpdir(), 'jean2', '');

const input = JSON.parse(await readStdin());
const { path: inputPath, workspacePath, offset, limit, sessionId } = input;

if (!sessionId || !workspacePath) {
  console.log(JSON.stringify({
    error: 'Missing required sessionId or workspacePath',
  }));
  process.exit(0);
}

function resolvePath(p, ws) {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  return path.resolve(ws, p);
}

function computeChecksum(filePath, size, mtimeMs) {
  const data = `${filePath}:${size}:${mtimeMs}`;
  return crypto.createHash('md5').update(data).digest('hex').substring(0, 8);
}

(async () => {
  try {
    const resolvedPath = resolvePath(inputPath, workspacePath);
    const stat = await fsPromises.stat(resolvedPath);

    if (!stat) {
      console.log(JSON.stringify({ error: `File not found: ${resolvedPath}` }));
      return;
    }

    if (stat.isDirectory()) {
      console.log(JSON.stringify({ error: `Path is a directory, not a file: ${resolvedPath}` }));
      return;
    }

    if (stat.size > MAX_FILE_SIZE) {
      console.log(JSON.stringify({ error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` }));
      return;
    }

    const checksum = computeChecksum(resolvedPath, stat.size, stat.mtimeMs);
    const cacheDir = `${JEAN2_TEMP_PREFIX}${sessionId}`;
    const cachePath = path.join(cacheDir, `file-to-markdown-${checksum}.md`);

    let markdown;
    let fromCache = false;

    if (fs.existsSync(cachePath)) {
      markdown = await fsPromises.readFile(cachePath, 'utf-8');
      fromCache = true;
    } else {
      markdown = await convertToMarkdown(resolvedPath);
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, markdown);
      } catch {
        // cache write failed, still return result
      }
    }

    const lines = markdown.split('\n');

    const readLimit = limit ?? DEFAULT_READ_LIMIT;
    const readOffset = offset ?? 1;
    const start = readOffset - 1;

    if (readOffset < 1) {
      console.log(JSON.stringify({ error: 'offset must be greater than or equal to 1' }));
      return;
    }

    const outputLines = [];
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
      finalContent += `\n\n(End of converted markdown - total ${totalLines} lines)`;
    }

    const cacheInfo = fromCache ? ' (from cache)' : '';
    console.log(JSON.stringify({
      content: finalContent,
      cachePath,
      _visualization: {
        type: 'none',
        message: `Converted to markdown: ${resolvedPath}${cacheInfo}`,
      },
    }));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
})();
