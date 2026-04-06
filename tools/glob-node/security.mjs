import os from 'node:os';
import path from 'node:path';

const BLOCKED_PATHS = [
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

function normalizePath(pathToNormalize) {
  if (pathToNormalize === '~' || pathToNormalize.startsWith('~/')) {
    return pathToNormalize.replace('~', os.homedir());
  }
  return pathToNormalize;
}

function resolvePath(inputPath, basePath) {
  const normalized = normalizePath(inputPath);
  const normalizedBase = normalizePath(basePath);

  if (normalized.startsWith('/')) {
    return path.resolve(normalized);
  }

  const resolved = path.resolve(normalizedBase, normalized);
  const finalBase = path.resolve(normalizedBase);

  if (!resolved.startsWith(finalBase)) {
    return resolved;
  }

  return resolved;
}

function isBlockedPath(filePath) {
  const normalized = normalizePath(filePath);
  return BLOCKED_PATHS.some(blocked => normalized.startsWith(blocked));
}

function isOutsideWorkspace(resolvedPath, workspacePath) {
  const normalizedWorkspace = normalizePath(workspacePath);
  const resolvedWorkspace = path.resolve(normalizedWorkspace);

  return !resolvedPath.startsWith(resolvedWorkspace);
}

async function main() {
  try {
    const inputText = await (() => {
      const chunks = [];
      const stdin = process.stdin;
      return new Promise((resolve, reject) => {
        stdin.on('data', (chunk) => chunks.push(chunk));
        stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
        stdin.on('error', reject);
      });
    })();
    const input = JSON.parse(inputText);
    const { pattern, path: globPath } = input.args;
    const { workspacePath } = input;

    const searchPath = globPath || workspacePath;
    const normalizedPath = normalizePath(searchPath);

    if (isBlockedPath(normalizedPath)) {
      const result = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'path:system_directory',
        message: `Globbing system directories is not allowed: ${searchPath}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    const JEAN2_TEMP_PREFIX = path.join(os.tmpdir(), 'jean2', '');

    if (normalizedPath.startsWith(JEAN2_TEMP_PREFIX)) {
      const result = {
        allowed: true,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:glob',
        message: 'Globbing Jean2 temp directory (persisted tool output).',
        details: {
          originalPath: searchPath,
          normalizedPath,
          resolvedPath: normalizedPath,
          pattern,
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const resolvedPath = resolvePath(normalizedPath, workspacePath);
    const outsideWorkspace = isOutsideWorkspace(resolvedPath, workspacePath);

    let permissionKey;
    let message;
    let requiresApproval;
    let permissionType;

    if (outsideWorkspace) {
      permissionKey = 'path:outside_workspace';
      message = `Globbing outside the workspace requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else {
      permissionKey = 'tool:glob';
      message = `Globbing within workspace.`;
      requiresApproval = false;
      permissionType = 'tool';
    }

    const result = {
      allowed: true,
      requiresApproval,
      permissionType,
      permissionKey,
      message,
      details: {
        originalPath: searchPath,
        normalizedPath,
        resolvedPath,
        outsideWorkspace,
        pattern,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:glob',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
