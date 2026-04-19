import os from 'node:os';
import path from 'node:path';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

const SENSITIVE_PATTERNS = [
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

function resolvePath(inputPath, workspacePath) {
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

function isSensitivePath(filePath) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(filePath));
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

function isInAllowedPath(resolvedPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) return false;
  for (const allowedPath of allowedPaths) {
    const normalized = normalizePath(allowedPath);
    const resolvedAllowed = path.resolve(normalized);
    if (resolvedPath.startsWith(resolvedAllowed)) return true;
  }
  return false;
}

async function main() {
  try {
    const inputText = await readStdin();
    const input = JSON.parse(inputText);
    const { path: filePath } = input.args;
    const { workspacePath } = input;

    const normalizedPath = normalizePath(filePath);

    if (isBlockedPath(normalizedPath)) {
      const result = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'path:system_directory',
        message: `Reading from system directories is not allowed: ${filePath}`,
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
        permissionKey: 'tool:file-to-markdown',
        message: 'Reading from Jean2 temp directory (persisted tool output).',
        details: {
          originalPath: filePath,
          normalizedPath,
          resolvedPath: normalizedPath,
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const allowed = isInAllowedPath(path.resolve(normalizedPath), input.allowedPaths);
    if (allowed) {
      const result = {
        allowed: true,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:file-to-markdown',
        message: 'Reading from allowed path.',
        details: {
          originalPath: filePath,
          normalizedPath,
          resolvedPath: path.resolve(normalizedPath),
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const resolvedPath = resolvePath(normalizedPath, workspacePath);

    const outsideWorkspace = isOutsideWorkspace(resolvedPath, workspacePath);
    const sensitive = isSensitivePath(resolvedPath);

    let permissionKey;
    let message;
    let requiresApproval;
    let permissionType;

    if (outsideWorkspace) {
      permissionKey = 'path:outside_workspace';
      message = `Reading from files outside the workspace requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else if (sensitive) {
      permissionKey = 'file_pattern:sensitive';
      message = `Reading from sensitive files requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else {
      permissionKey = 'tool:file-to-markdown';
      message = `Reading from file within workspace.`;
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
        originalPath: filePath,
        normalizedPath,
        resolvedPath,
        outsideWorkspace,
        sensitive,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:file-to-markdown',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
