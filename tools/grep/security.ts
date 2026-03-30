import os from 'node:os';
import path from 'node:path';

interface SecurityInput {
  args: {
    pattern: string;
    path?: string;
    include?: string;
  };
  workspacePath: string;
  sessionId: string;
}

interface SecurityResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: 'tool' | 'action';
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.ssh\//i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.gitconfig$/i,
  /\.npmrc$/i,
  /credentials/i,
  /secrets?/i,
  /password/i,
  /\.htpasswd$/i,
];

const BLOCKED_PATHS: string[] = [
  '/etc/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/boot/',
  '/dev/',
  '/proc/',
  '/sys/',
  '/root/',
];

function normalizePath(pathToNormalize: string): string {
  if (pathToNormalize === '~' || pathToNormalize.startsWith('~/')) {
    return pathToNormalize.replace('~', os.homedir());
  }
  return pathToNormalize;
}

function resolvePath(inputPath: string, workspacePath: string): string {
  const normalized = normalizePath(inputPath);
  const normalizedWorkspace = normalizePath(workspacePath);

  if (normalized.startsWith('/')) {
    return path.resolve(normalized);
  }

  const resolved = path.resolve(normalizedWorkspace, normalized);

  const finalWorkspace = path.resolve(normalizedWorkspace);
  if (!resolved.startsWith(finalWorkspace)) {
    return resolved;
  }

  return resolved;
}

function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(filePath));
}

function isBlockedPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return BLOCKED_PATHS.some(blocked => normalized.startsWith(blocked));
}

function isOutsideWorkspace(resolvedPath: string, workspacePath: string): boolean {
  const normalizedWorkspace = normalizePath(workspacePath);
  const resolvedWorkspace = path.resolve(normalizedWorkspace);

  return !resolvedPath.startsWith(resolvedWorkspace);
}

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: SecurityInput = JSON.parse(inputText);
    const { path: searchPath } = input.args;
    const { workspacePath } = input;

    const targetPath = searchPath || workspacePath;

    const normalizedPath = normalizePath(targetPath);

    if (isBlockedPath(normalizedPath)) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'path:system_directory',
        message: `Searching in system directories is not allowed: ${targetPath}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    const JEAN2_TEMP_PREFIX = path.join(os.tmpdir(), 'jean2', '');

    if (normalizedPath.startsWith(JEAN2_TEMP_PREFIX)) {
      const result: SecurityResult = {
        allowed: true,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:grep',
        message: 'Searching Jean2 temp directory (persisted tool output).',
        details: {
          originalPath: searchPath || workspacePath,
          normalizedPath,
          resolvedPath: normalizedPath,
          pattern: input.args.pattern,
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const resolvedPath = resolvePath(normalizedPath, workspacePath);

    const outsideWorkspace = isOutsideWorkspace(resolvedPath, workspacePath);
    const sensitive = isSensitivePath(resolvedPath);

    let permissionKey: string;
    let message: string;
    let requiresApproval: boolean;
    let permissionType: 'tool' | 'action';

    if (outsideWorkspace) {
      permissionKey = 'path:outside_workspace';
      message = 'Searching in files outside the workspace requires approval.';
      requiresApproval = true;
      permissionType = 'action';
    } else if (sensitive) {
      permissionKey = 'file_pattern:sensitive';
      message = 'Searching in sensitive directories requires approval.';
      requiresApproval = true;
      permissionType = 'action';
    } else {
      permissionKey = 'tool:grep';
      message = 'Searching within workspace.';
      requiresApproval = false;
      permissionType = 'tool';
    }

    const result: SecurityResult = {
      allowed: true,
      requiresApproval,
      permissionType,
      permissionKey,
      message,
      details: {
        originalPath: searchPath || workspacePath,
        normalizedPath,
        resolvedPath,
        outsideWorkspace,
        sensitive,
        pattern: input.args.pattern,
        include: input.args.include,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err: unknown) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:grep',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
