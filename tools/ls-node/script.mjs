import { readdir, stat } from 'fs/promises';
import path from 'node:path';
import os from 'node:os';

const LIMIT = 100;

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  'dist',
  'build',
  'target',
  'vendor',
  'bin',
  'obj',
  '.idea',
  '.vscode',
  '.zig-cache',
  'zig-out',
  '.coverage',
  'coverage',
  'tmp',
  'temp',
  '.cache',
  'cache',
  'logs',
  '.venv',
  'venv',
  'env',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
]);

function resolvePath(p, ws) {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  return path.resolve(ws, p);
}

function shouldIgnore(name, additionalIgnore) {
  if (IGNORED_NAMES.has(name)) {
    return true;
  }
  if (additionalIgnore && additionalIgnore.includes(name)) {
    return true;
  }
  return false;
}

async function walkDirectory(dirPath, relativePath, files, showHidden, additionalIgnore) {
  if (files.length >= LIMIT) {
    return;
  }

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    const errno = err;
    if (errno.code === 'EACCES' || errno.code === 'EPERM' || errno.code === 'ENOENT') {
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (files.length >= LIMIT) {
      return;
    }

    if (!showHidden && entry.name.startsWith('.')) {
      continue;
    }

    if (shouldIgnore(entry.name, additionalIgnore)) {
      continue;
    }

    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const fullPath = path.join(dirPath, entry.name);
      await walkDirectory(fullPath, entryRelativePath, files, showHidden, additionalIgnore);
    } else {
      files.push(entryRelativePath);
    }
  }
}

function buildDirectoryStructure(files) {
  const dirs = new Set();
  const filesByDir = new Map();

  for (const file of files) {
    const dir = path.dirname(file);
    const parts = dir === '.' ? [] : dir.split(/[\\\/]/);

    for (let i = 0; i <= parts.length; i++) {
      const dirPath = i === 0 ? '.' : parts.slice(0, i).join('/');
      dirs.add(dirPath);
    }

    const fileName = path.basename(file);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir).push(fileName);
  }

  return { dirs, filesByDir };
}

function renderDir(dirPath, depth, dirs, filesByDir, isLast = true, parentPrefix = '') {
  const lines = [];
  const branch = isLast ? '└── ' : '├── ';

  if (depth === 0) {
    lines.push('./');
  } else {
    lines.push(`${parentPrefix}${branch}${path.basename(dirPath)}/`);
  }

  const childPrefix = parentPrefix + (isLast ? '    ' : '│   ');

  const childDirs = Array.from(dirs)
    .filter((d) => path.dirname(d) === dirPath && d !== dirPath)
    .sort();

  const childFiles = (filesByDir.get(dirPath) || []).slice().sort();

  for (let i = 0; i < childDirs.length; i++) {
    const isLastDir = i === childDirs.length - 1 && childFiles.length === 0;
    const dirLines = renderDir(childDirs[i], depth + 1, dirs, filesByDir, isLastDir, childPrefix);
    lines.push(dirLines);
  }

  for (let i = 0; i < childFiles.length; i++) {
    const isLastFile = i === childFiles.length - 1;
    const fileBranch = isLastFile ? '└── ' : '├── ';
    lines.push(`${childPrefix}${fileBranch}${childFiles[i]}`);
  }

  return lines.join('\n');
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
    const output = { content: '', error: 'Invalid JSON input' };
    console.log(JSON.stringify(output));
    return;
  }

  const { path: inputPath, ignore, showHidden = false, workspacePath, sessionId } = input;

  if (!sessionId || !workspacePath) {
    const output = { content: '', error: 'Missing required sessionId or workspacePath' };
    console.log(JSON.stringify(output));
    return;
  }

  try {
    const cwd = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;

    let dirStat;
    try {
      dirStat = await stat(cwd);
    } catch {
      const output = { content: '', error: `Directory not found: ${cwd}` };
      console.log(JSON.stringify(output));
      return;
    }

    if (!dirStat.isDirectory()) {
      const output = { content: '', error: `Not a directory: ${cwd}` };
      console.log(JSON.stringify(output));
      return;
    }

    const files = [];
    await walkDirectory(cwd, '', files, showHidden, ignore);

    const truncated = files.length >= LIMIT;
    const { dirs, filesByDir } = buildDirectoryStructure(files);

    let content = renderDir('.', 0, dirs, filesByDir);

    if (truncated) {
      content += `\n\n(Showing 100 of ${files.length} entries. Use grep or glob for targeted searching.)`;
    }

    const output = {
      content,
      _truncated: truncated || undefined,
      _count: files.length,
      _visualization: { type: 'none', message: `Ls: ${inputPath || 'workspace'}` },
    };
    console.log(JSON.stringify(output));
  } catch (e) {
    const output = { content: '', error: e.message };
    console.log(JSON.stringify(output));
  }
}

main();
