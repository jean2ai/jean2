import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { NoneVisualization } from '@jean2/sdk';

interface Input {
  pattern: string;
  path?: string;
}

const SKIP_DIRS = new Set([
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
]);

export const definition: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time.\n\nWhen to use:\n- Finding files by name patterns (e.g., all TypeScript files)\n- Locating specific file types in a project\n- When you know the directory structure pattern\n\nWhen NOT to use:\n- Searching file contents: Use grep tool instead\n- Exploring unknown structure: Use ls tool instead\n\nPattern examples:\n- `**/*.ts` - All TypeScript files recursively\n- `src/**/*.tsx` - All TSX files in src directory\n- `*.{js,ts}` - All JS and TS files in current directory\n- `package.json` - Specific file',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match',
      },
      path: {
        type: 'string',
        description: 'The directory to search in. Supports relative paths from workspace, absolute paths, or home paths. Defaults to workspace root.',
      },
    },
    required: ['pattern'],
  },
  timeout: 30000,
};

function globToRegex(pattern: string): RegExp {
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

  let regexStr: string;

  if (hasLeadingRecursive) {
    const remainingParts = regexParts.slice(1);
    regexStr = '^(?:' + remainingParts.join('/') + '|[^/]*/' + remainingParts.join('/') + ')$';
  } else {
    regexStr = '^' + regexParts.join('/') + '$';
  }

  return new RegExp(regexStr);
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

function isRecursivePattern(pattern: string): boolean {
  return pattern.includes('**');
}

async function walkDirectory(
  ctx: ToolContext,
  dirPath: string,
  pattern: string,
  basePath: string,
  results: string[],
  recursive: boolean,
): Promise<void> {
  const dirName = dirPath.split(/[/\\]/).pop() || '';
  if (SKIP_DIRS.has(dirName)) {
    return;
  }

  try {
    const entries = await ctx.fs.readDir(dirPath);

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      const relativePath = fullPath.replace(basePath, '').replace(/^[/\\]/, '').replace(/\\/g, '/');

      if (entry.isDirectory) {
        if (recursive) {
          await walkDirectory(ctx, fullPath, pattern, basePath, results, recursive);
        }
      } else if (entry.isFile) {
        if (matchesGlob(relativePath, pattern)) {
          results.push(relativePath);
        }
      }
    }
  } catch (error) {
    const err = error as { code?: string };
    if (err.code !== 'EACCES' && err.code !== 'EPERM' && err.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const searchPath = input.path || ctx.workspacePath;
    const normalizedPath = ctx.resolvePath(searchPath);

    if (ctx.isBlockedPath(normalizedPath)) {
      return { success: false, error: `Globbing system directories is not allowed: ${searchPath}` };
    }

    const tempDir = ctx.env.get('JEAN2_TEMP_DIR') || ctx.env.get('TMPDIR') || '';
    const jean2TempPrefix = tempDir ? `${tempDir.replace(/[/\\]$/, '')}/jean2/` : '';
    const isJean2Temp = jean2TempPrefix && normalizedPath.startsWith(jean2TempPrefix);

    if (!isJean2Temp && !ctx.isWithinWorkspace(normalizedPath)) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Globbing outside the workspace requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'path:outside_workspace', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const cwd = input.path ? ctx.fs.resolve(input.path) : ctx.workspacePath;

    const hasWildcard = input.pattern.includes('*') || input.pattern.includes('?');
    const recursive = isRecursivePattern(input.pattern);
    const results: string[] = [];

    if (!hasWildcard) {
      try {
        const exists = await ctx.fs.exists(cwd + '/' + input.pattern);
        if (exists) {
          results.push(input.pattern);
        }
      } catch { /* empty */ }
      return {
        success: true,
        result: { files: results },
        visualization: { type: 'none', message: `Glob: "${input.pattern}" (${results.length} files)` } as NoneVisualization,
      };
    }

    await walkDirectory(ctx, cwd, input.pattern, cwd, results, recursive);

    const visualization: NoneVisualization = {
      type: 'none',
      message: `Glob: "${input.pattern}" (${results.length} files)`,
    };

    return {
      success: true,
      result: { files: results },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}