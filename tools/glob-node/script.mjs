import { readdir, stat } from 'fs/promises';
import { join, relative, resolve } from 'path';
import path from 'node:path';
import os from 'node:os';

function resolvePath(p, ws) {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  return path.resolve(ws, p);
}

function globToRegex(pattern) {
  const parts = pattern.split('/');

  const hasLeadingRecursive = parts[0] === '**';

  const regexParts = parts.map((part) => {
    if (part === '**') {
      return '(?:.+/)?';
    }
    if (part === '*') {
      return '[^/]*';
    }
    return part
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
  });

  let regexStr;

  if (hasLeadingRecursive) {
    const remainingParts = regexParts.slice(1);
    regexStr = '^(?:' + remainingParts.join('/') + '|[^/]*/' + remainingParts.join('/') + ')$';
  } else {
    regexStr = '^' + regexParts.join('/') + '$';
  }

  return new RegExp(regexStr);
}

function matchesGlob(filePath, pattern) {
  const normalizedPath = filePath.replace(/\\/g, '/');

  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

function isRecursivePattern(pattern) {
  return pattern.includes('**');
}

async function walkDirectory(dirPath, pattern, basePath, results, recursive) {
  const dirName = dirPath.split(/[/\\]/).pop() || '';
  if (dirName === 'node_modules') {
    return;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (recursive) {
          await walkDirectory(fullPath, pattern, basePath, results, recursive);
        }
      } else if (entry.isFile()) {
        if (matchesGlob(relativePath, pattern)) {
          results.push(relativePath);
        }
      }
    }
  } catch (error) {
    const err = error;
    if (err.code !== 'EACCES' && err.code !== 'EPERM' && err.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function glob(pattern, cwd) {
  const results = [];
  const resolvedCwd = resolve(cwd);

  const hasWildcard = pattern.includes('*') || pattern.includes('?');
  const recursive = isRecursivePattern(pattern);

  if (!hasWildcard) {
    try {
      const filePath = join(resolvedCwd, pattern);
      await stat(filePath);
      results.push(pattern);
    } catch {
      // File doesn't exist
    }
    return results;
  }

  await walkDirectory(resolvedCwd, pattern, resolvedCwd, results, recursive);

  return results.sort();
}

async function main() {
  const inputText = await (() => {
    const chunks = [];
    const stdin = process.stdin;

    return new Promise((resolve, reject) => {
      stdin.on('data', (chunk) => chunks.push(chunk));
      stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stdin.on('error', reject);
    });
  })();

  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output = { files: [], error: 'Invalid JSON input' };
    console.log(JSON.stringify(output));
    return;
  }

  const { pattern, path: inputPath, workspacePath, sessionId } = input;

  if (!sessionId || !workspacePath) {
    const output = { files: [], error: 'Missing required sessionId or workspacePath' };
    console.log(JSON.stringify(output));
    return;
  }

  if (!pattern) {
    const output = { files: [], error: 'Pattern is required' };
    console.log(JSON.stringify(output));
    return;
  }

  try {
    const cwd = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;
    const files = await glob(pattern, cwd);
    const output = {
      files,
      _visualization: {
        type: 'none',
        message: `Glob: "${pattern}" (${files.length} files)`,
      },
    };
    console.log(JSON.stringify(output));
  } catch (e) {
    const output = { files: [], error: e.message };
    console.log(JSON.stringify(output));
  }
}

main();
