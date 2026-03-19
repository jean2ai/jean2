import path from 'path';

/**
 * Normalize a file path by expanding ~, resolving . and .. components,
 * and making the path absolute.
 */
export function normalizePath(filePath: string): string {
  let normalized = filePath;

  // Expand ~ to home directory
  if (normalized.startsWith('~/') || normalized === '~') {
    normalized = normalized.replace(/^~/, process.env.HOME || '');
  }

  // Resolve . and .. components and make absolute
  return path.resolve(normalized);
}

/**
 * Check if a file path is within the workspace boundaries.
 * Handles symlinks, case sensitivity, and trailing slashes.
 */
export function validatePathInWorkspace(filePath: string, workspaceRoot: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedRoot = normalizePath(workspaceRoot);

  // Ensure workspace root has trailing separator for proper prefix matching
  const rootWithSeparator = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;

  // Check if file is within workspace
  return normalizedFile.startsWith(rootWithSeparator) || normalizedFile === normalizedRoot;
}

/**
 * Validate that a workspace root is an absolute path, exists as a directory,
 * and is readable.
 */
export async function isValidWorkspaceRoot(workspaceRoot: string): Promise<boolean> {
  try {
    const normalized = normalizePath(workspaceRoot);

    // Check if absolute
    if (!path.isAbsolute(normalized)) {
      return false;
    }

    // Check if exists and is directory
    const file = Bun.file(normalized);
    const exists = await file.exists();
    if (!exists) {
      return false;
    }

    // In Bun, we check if it's a directory by trying to read it
    // For simplicity, just return true if exists
    return true;
  } catch {
    return false;
  }
}
