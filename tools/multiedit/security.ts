import path from 'node:path';

interface MultiEditSecurityInput {
  args: {
    path: string;
    edits: Array<{ oldString: string; newString: string; strategy?: string }>;
  };
  workspacePath: string;
  sessionId: string;
}

interface MultiEditSecurityResult {
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

const MAX_EDITS_WITHOUT_APPROVAL = 10;

function normalizePath(pathToNormalize: string): string {
  if (pathToNormalize === '~' || pathToNormalize.startsWith('~/')) {
    return pathToNormalize.replace('~', process.env.HOME || '~');
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

function hasExcessiveEdits(edits: Array<{ oldString: string; newString: string; strategy?: string }>): boolean {
  return edits.length > MAX_EDITS_WITHOUT_APPROVAL;
}

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: MultiEditSecurityInput = JSON.parse(inputText);
    const { path: filePath, edits } = input.args;
    const { workspacePath } = input;

    const normalizedPath = normalizePath(filePath);

    if (isBlockedPath(normalizedPath)) {
      const result: MultiEditSecurityResult = {
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

    let permissionKey: string;
    let message: string;
    let requiresApproval: boolean;
    let permissionType: 'tool' | 'action';

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

    const result: MultiEditSecurityResult = {
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
  } catch (err: unknown) {
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
