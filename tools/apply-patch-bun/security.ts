import os from 'node:os';
import path from 'node:path';

interface ApplyPatchSecurityInput {
  args: {
    patch: string;
  };
  workspacePath: string;
  sessionId: string;
}

interface ApplyPatchSecurityResult {
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

function parseFilePathsFromPatch(
  patchContent: string,
): { originalPath: string; newPath: string; isDeletion: boolean }[] {
  const results: { originalPath: string; newPath: string; isDeletion: boolean }[] = [];
  const lines = patchContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('---')) {
      const originalLine = lines[i];
      const newLine = lines[i + 1]?.startsWith('+++') ? lines[i + 1] : '';

      let originalPath = originalLine.substring(4).trim();
      let newPath = newLine.substring(4).trim();

      if (originalPath.startsWith('a/')) originalPath = originalPath.substring(2);
      if (newPath.startsWith('b/')) newPath = newPath.substring(2);

      originalPath = originalPath.split('\t')[0];
      newPath = newPath.split('\t')[0];

      const isDeletion = newPath === '/dev/null' || newPath.startsWith('/dev/null');
      const isCreation = originalPath === '/dev/null' || originalPath.startsWith('/dev/null');

      if (!isCreation) {
        results.push({ originalPath, newPath, isDeletion });
      } else if (isCreation && newPath !== '/dev/null') {
        results.push({ originalPath: newPath, newPath, isDeletion: false });
      }
    }
  }

  return results;
}

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: ApplyPatchSecurityInput = JSON.parse(inputText);
    const { patch } = input.args;
    const { workspacePath } = input;

    const parsedFiles = parseFilePathsFromPatch(patch);

    if (parsedFiles.length === 0) {
      const result: ApplyPatchSecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:apply-patch',
        message: 'No valid file paths found in patch',
      };
      console.log(JSON.stringify(result));
      return;
    }

    const blockedFiles: string[] = [];
    const outsideWorkspaceFiles: { path: string; resolvedPath: string }[] = [];
    const sensitiveFiles: string[] = [];
    const deletionFiles: string[] = [];

    for (const file of parsedFiles) {
      const checkPath = file.newPath || file.originalPath;
      const normalizedPath = normalizePath(checkPath);
      const resolvedPath = resolvePath(normalizedPath, workspacePath);

      if (file.isDeletion) {
        deletionFiles.push(file.originalPath);
        continue;
      }

      if (isBlockedPath(resolvedPath)) {
        blockedFiles.push(checkPath);
        continue;
      }

      if (isOutsideWorkspace(resolvedPath, workspacePath)) {
        outsideWorkspaceFiles.push({ path: checkPath, resolvedPath });
      }

      if (isSensitivePath(resolvedPath)) {
        sensitiveFiles.push(checkPath);
      }
    }

    if (blockedFiles.length > 0) {
      const result: ApplyPatchSecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'path:system_directory',
        message: `Cannot apply patch to system directories: ${blockedFiles.join(', ')}`,
        details: {
          blockedFiles,
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    let permissionKey: string;
    let message: string;
    let requiresApproval = false;

    const hasOutsideWorkspace = outsideWorkspaceFiles.length > 0;
    const hasSensitive = sensitiveFiles.length > 0;
    const hasDeletion = deletionFiles.length > 0;

    if (hasOutsideWorkspace) {
      permissionKey = 'path:outside_workspace';
      message = `Applying patch to files outside the workspace requires approval.`;
      requiresApproval = true;
    } else if (hasSensitive) {
      permissionKey = 'file_pattern:sensitive';
      message = `Applying patch to sensitive files requires approval.`;
      requiresApproval = true;
    } else if (hasDeletion) {
      permissionKey = 'file:deletion';
      message = `Applying patch that deletes files requires approval.`;
      requiresApproval = true;
    } else {
      permissionKey = 'tool:apply-patch';
      message = `Applying patch within workspace.`;
      requiresApproval = false;
    }

    const result: ApplyPatchSecurityResult = {
      allowed: true,
      requiresApproval,
      permissionType: requiresApproval ? 'action' : 'tool',
      permissionKey,
      message,
      details: {
        parsedFiles,
        outsideWorkspaceFiles,
        sensitiveFiles,
        deletionFiles,
        hasOutsideWorkspace,
        hasSensitive,
        hasDeletion,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err: unknown) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:apply-patch',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
