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

const MAX_EDITS_WITHOUT_APPROVAL = 10;

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

function hasExcessiveEdits(edits) {
  return edits.length > MAX_EDITS_WITHOUT_APPROVAL;
}

async function main() {
  try {
    const inputText = await readStdin();
    const input = JSON.parse(inputText);
    const { path: filePath, edits } = input.args;
    const { workspacePath } = input;

    const normalizedPath = normalizePath(filePath);

    if (isBlockedPath(normalizedPath)) {
      const result = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'path:system_directory',
        message: `Editing system directories is not allowed: ${filePath}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    const resolvedPath = resolvePath(normalizedPath, workspacePath);

    const outsideWorkspace = isOutsideWorkspace(resolvedPath, workspacePath);
    const sensitive = isSensitivePath(resolvedPath);
    const excessive = hasExcessiveEdits(edits);

    let permissionKey;
    let message;
    let requiresApproval;
    let permissionType;

    if (outsideWorkspace) {
      permissionKey = 'path:outside_workspace';
      message = `Editing files outside the workspace requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else if (sensitive) {
      permissionKey = 'file_pattern:sensitive';
      message = `Editing sensitive files requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else if (excessive) {
      permissionKey = 'edit_count:excessive';
      message = `Editing more than ${MAX_EDITS_WITHOUT_APPROVAL} edits at once requires approval.`;
      requiresApproval = true;
      permissionType = 'action';
    } else {
      permissionKey = 'tool:multiedit';
      message = `Editing file within workspace.`;
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
        excessive,
        editCount: edits.length,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:multiedit',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
