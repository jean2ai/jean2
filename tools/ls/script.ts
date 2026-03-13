import { readdir, stat } from 'fs/promises';
import path from 'node:path';
import os from 'node:os';

interface Input {
  path?: string;
  recursive?: boolean;
  depth?: number;
  showHidden?: boolean;
  workspacePath: string;
}

interface Output {
  content: string;
  error?: string;
  _visualization?: {
    type: 'none';
    message: string;
  };
}

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.DS_Store',
];

function resolvePath(p: string, ws: string): string {
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }

  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }

  return path.resolve(ws, p);
}

interface TreeNode {
  name: string;
  isDirectory: boolean;
  children: TreeNode[];
}

async function buildTree(
  dirPath: string,
  currentDepth: number,
  maxDepth: number | undefined,
  showHidden: boolean
): Promise<TreeNode | null> {
  const dirName = path.basename(dirPath);

  if (IGNORED_DIRS.includes(dirName)) {
    return null;
  }

  try {
    const stats = await stat(dirPath);
    const node: TreeNode = {
      name: dirName,
      isDirectory: stats.isDirectory(),
      children: [],
    };

    if (!stats.isDirectory()) {
      return node;
    }

    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      return node;
    }

    const entries = await readdir(dirPath, { withFileTypes: true });

    const children: TreeNode[] = [];

    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const childNode = await buildTree(
        fullPath,
        currentDepth + 1,
        maxDepth,
        showHidden
      );

      if (childNode) {
        children.push(childNode);
      }
    }

    children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    node.children = children;
    return node;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function formatTree(node: TreeNode, prefix: string = '', isLast: boolean = true): string[] {
  const lines: string[] = [];

  if (prefix === '') {
    lines.push(node.name + '/');
  } else {
    const branch = isLast ? '└── ' : '├── ';
    lines.push(prefix + branch + (node.isDirectory ? node.name + '/' : node.name));
  }

  if (node.isDirectory && node.children.length > 0) {
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isLastChild = i === node.children.length - 1;
      const childLines = formatTree(child, childPrefix, isLastChild);
      lines.push(...childLines);
    }
  }

  return lines;
}

async function main(): Promise<void> {
  const inputText = await ((): Promise<string> => {
    const chunks: Buffer[] = [];
    const stdin = process.stdin;

    return new Promise<string>((resolve, reject) => {
      stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stdin.on('error', reject);
    });
  })();

  let input: Input;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output: Output = { content: '', error: 'Invalid JSON input' };
    console.log(JSON.stringify(output));
    return;
  }

  const { path: inputPath, recursive = true, depth, showHidden = false, workspacePath } = input;

  try {
    const cwd = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;

    const stats = await stat(cwd);

    if (!stats.isDirectory()) {
      const output: Output = {
        content: path.basename(cwd),
        error: undefined,
        _visualization: { type: 'none', message: `Ls: ${inputPath || 'workspace'}` },
      };
      console.log(JSON.stringify(output));
      return;
    }

    const tree = await buildTree(cwd, 0, recursive ? depth : 1, showHidden);

    if (!tree) {
      const output: Output = { content: '', error: 'Unable to read directory' };
      console.log(JSON.stringify(output));
      return;
    }

    const treeLines = formatTree(tree);
    const output: Output = {
      content: treeLines.join('\n'),
      _visualization: { type: 'none', message: `Ls: ${inputPath || 'workspace'}` },
    };
    console.log(JSON.stringify(output));
  } catch (e) {
    const output: Output = { content: '', error: (e as Error).message };
    console.log(JSON.stringify(output));
  }
}

main();
