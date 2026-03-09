// Security script for write-file tool
// Receives: { args, workspacePath, sessionId }
// Outputs: { allowed, requiresApproval, permissionType, permissionKey, message, details? }

import path from 'node:path';

interface WriteFileSecurityInput {
  args: {
    path: string;
    content: string;
  };
  workspacePath: string;
  sessionId: string;
}

interface WriteFileSecurityResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: 'tool' | 'action';
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
}

// Sensitive file patterns that should always require approval
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

// System directories that should be blocked
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

function normalizePath(pathToNormalize: string): string {
  // Expand ~ to home directory
  if (pathToNormalize === '~' || pathToNormalize.startsWith('~/')) {
    return pathToNormalize.replace('~', process.env.HOME || '~');
  }
  return pathToNormalize;
}

function resolvePath(inputPath: string, workspacePath: string): string {
  // Normalize both input path and workspace path (expand ~)
  const normalized = normalizePath(inputPath);
  const normalizedWorkspace = normalizePath(workspacePath);

  // If path is absolute (starts with /), return resolved path
  if (normalized.startsWith('/')) {
    return path.resolve(normalized);
  }

  // For relative paths, join with normalized workspace and resolve
  const resolved = path.resolve(normalizedWorkspace, normalized);

  // Security check: verify the resolved path is still within workspace
  // This prevents path traversal attacks like ../../etc/passwd
  const finalWorkspace = path.resolve(normalizedWorkspace);
  if (!resolved.startsWith(finalWorkspace)) {
    // Path escaped the workspace - return the resolved path but it will be caught by isOutsideWorkspace
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

function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

async function main() {
  const inputText = await Bun.stdin.text();
  const input: WriteFileSecurityInput = JSON.parse(inputText);
  const { path: filePath } = input.args;
  const { workspacePath } = input;

  // Normalize first (for ~ expansion) before checking blocked paths
  const normalizedPath = normalizePath(filePath);

  // Check for blocked paths first
  if (isBlockedPath(normalizedPath)) {
    const result: WriteFileSecurityResult = {
      allowed: false,
      requiresApproval: false,
      permissionType: 'action',
      permissionKey: 'path:system_directory',
      message: `Writing to system directories is not allowed: ${filePath}`,
    };
    console.log(JSON.stringify(result));
    return;
  }

  // Resolve relative paths to absolute paths within workspace
  const resolvedPath = resolvePath(normalizedPath, workspacePath);

  // Check if the resolved path is outside workspace (includes path traversal detection)
  const outsideWorkspace = isOutsideWorkspace(resolvedPath, workspacePath);
  const sensitive = isSensitivePath(resolvedPath);
  const extension = getFileExtension(resolvedPath);

  // Determine permission based on path analysis
  let permissionKey: string;
  let message: string;
  let requiresApproval: boolean;
  let permissionType: 'tool' | 'action';

  if (outsideWorkspace) {
    permissionKey = 'path:outside_workspace';
    message = `Writing to files outside the workspace requires approval.`;
    requiresApproval = true;
    permissionType = 'action';
  } else if (sensitive) {
    permissionKey = 'file_pattern:sensitive';
    message = `Writing to sensitive files requires approval.`;
    requiresApproval = true;
    permissionType = 'action';
  } else {
    // Within workspace and not sensitive - allow
    permissionKey = 'tool:write-file';
    message = `Writing to file within workspace.`;
    requiresApproval = false;
    permissionType = 'tool';
  }

  const result: WriteFileSecurityResult = {
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
      extension,
    },
  };

  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.log(
    JSON.stringify({
      allowed: false,
      requiresApproval: false,
      permissionType: 'tool',
      permissionKey: 'tool:write-file',
      message: `Security check failed: ${err.message}`,
    }),
  );
});
