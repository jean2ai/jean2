import { resolve, isAbsolute, join } from 'path';
import { homedir } from 'os';

export function expandPath(inputPath: string): string {
  let expanded = inputPath;
  if (expanded.startsWith('~/') || expanded === '~') {
    expanded = join(homedir(), expanded.slice(1));
  }
  return resolve(expanded);
}

export function resolvePath(path: string, workspacePath: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1));
  }
  if (isAbsolute(path)) {
    return resolve(path);
  }
  return resolve(workspacePath, path);
}

export function isPathWithinWorkspace(
  targetPath: string,
  workspacePath: string,
  additionalPaths: string[] = [],
): boolean {
  const resolved = resolvePath(targetPath, workspacePath);
  const allAllowed = [resolve(workspacePath), ...additionalPaths.map((p) => resolve(p))];
  return allAllowed.some((allowed) => resolved.startsWith(allowed));
}
