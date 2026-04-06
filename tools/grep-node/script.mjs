import path, { relative, join, dirname } from 'node:path';
import os from 'node:os';
import { readFile, readdir, stat } from 'node:fs/promises';
import ignore from 'ignore';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

const input = JSON.parse(await readStdin());
const { pattern, path: inputPath, include, workspacePath, sessionId } = input;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  'bower_components',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2',
  '.ttf', '.eot', '.zip', '.tar', '.gz', '.7z', '.rar', '.pdf',
  '.exe', '.dll', '.so', '.dylib', '.wasm', '.mp4', '.mp3', '.wav',
  '.avi', '.mov', '.mkv', '.webp', '.webm', '.sqlite', '.db', '.bin', '.dat',
]);

const MAX_MATCHES = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function resolvePath(p, ws) {
  if (p === '~') {
    p = os.homedir();
  } else if (p.startsWith('~/')) {
    p = os.homedir() + p.slice(1);
  }
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  return path.resolve(ws, p);
}

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function globToRegex(pattern) {
  if (!pattern) return null;

  let patterns = [pattern];

  if (pattern.includes('{')) {
    const braceMatch = pattern.match(/^(.*?)\{([^}]+)\}(.*)$/);
    if (braceMatch) {
      const [, prefix, expansions, suffix] = braceMatch;
      patterns = expansions.split(',').map(e => `${prefix}${e.trim()}${suffix}`);
    }
  }

  const regexParts = patterns.map(p => {
    p = p.replace(/^\.\//, '');

    const segments = p.split(/[\\/]/);
    const regexSegments = segments.map(seg => {
      if (seg === '**') return '**';
      if (seg === '*') return '[^/]*';
      return seg
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
    });

    let result = '';
    for (let i = 0; i < regexSegments.length; i++) {
      const seg = regexSegments[i];
      if (seg === '**') {
        result += '(?:.+/)?';
      } else {
        if (i > 0 && regexSegments[i - 1] !== '**') {
          result += '/';
        }
        result += seg;
      }
    }

    return `^${result}$`;
  });

  return new RegExp(regexParts.join('|'));
}

async function searchInFile(filePath, regex) {
  const matches = [];

  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_FILE_SIZE) {
      return matches;
    }
  } catch { /* empty */ }

  try {
    const content = await readFile(filePath, 'utf-8');

    if (content.includes('\0')) {
      return matches;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        matches.push({
          line: i + 1,
          content: lines[i].trimEnd(),
        });
      }
    }
  } catch { /* empty */ }

  return matches;
}

async function walkDirectory(dirPath, basePath, ig, includeRegex, regex, matches) {
  const dirName = dirPath.split(/[/\\]/).pop() || '';
  if (SKIP_DIRS.has(dirName)) {
    return;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/');

      if (ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDirectory(fullPath, basePath, ig, includeRegex, regex, matches);
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(relativePath)) {
          continue;
        }

        if (isBinaryFile(fullPath)) {
          continue;
        }

        const fileMatches = await searchInFile(fullPath, regex);
        for (const fileMatch of fileMatches) {
          if (matches.length >= MAX_MATCHES) {
            return;
          }
          matches.push({
            file: relativePath,
            line: fileMatch.line,
            content: fileMatch.content,
          });
        }
      }
    }
  } catch (error) {
    const err = error;
    if (err.code !== 'EACCES' && err.code !== 'EPERM' && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      throw error;
    }
  }
}

async function main() {
  const searchPath = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;

  if (!sessionId || !workspacePath) {
    console.log(JSON.stringify({
      matches: [],
      error: 'Missing required sessionId or workspacePath',
      _visualization: {
        type: 'none',
        content: 'Grep error: Missing required sessionId or workspacePath',
      },
    }));
    return;
  }

  let isDirectory = true;
  try {
    const s = await stat(searchPath);
    isDirectory = s.isDirectory();
  } catch { /* empty */ }

  const gitignoreDir = isDirectory ? searchPath : dirname(searchPath);

  const ig = ignore();
  try {
    const gitignoreContent = await readFile(join(gitignoreDir, '.gitignore'), 'utf-8');
    ig.add(gitignoreContent);
  } catch { /* empty */ }

  let regex;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({
      matches: [],
      error: `Invalid regex pattern: ${message}`,
      _visualization: {
        type: 'none',
        content: `Grep error: Invalid regex pattern`,
      },
    }));
    return;
  }

  const includeRegex = include ? globToRegex(include) : null;

  const matches = [];

  if (!isDirectory) {
    const relativePath = relative(gitignoreDir, searchPath).replace(/\\/g, '/');
    if (!ig.ignores(relativePath) && !isBinaryFile(searchPath)) {
      const fileMatches = await searchInFile(searchPath, regex);
      for (const fileMatch of fileMatches) {
        if (matches.length >= MAX_MATCHES) break;
        matches.push({
          file: relativePath,
          line: fileMatch.line,
          content: fileMatch.content,
        });
      }
    }
  } else {
    await walkDirectory(searchPath, searchPath, ig, includeRegex, regex, matches);
  }

  const truncated = matches.length >= MAX_MATCHES;
  const content = truncated
    ? `Grep: "${pattern}" (${matches.length} matches, truncated to ${MAX_MATCHES})`
    : `Grep: "${pattern}" (${matches.length} matches)`;

  console.log(JSON.stringify({
    matches,
    _visualization: {
      type: 'none',
      content,
    },
  }));
}

main();
