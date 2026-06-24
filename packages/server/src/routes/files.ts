import type { Hono } from 'hono';
import { accessSync, constants } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve, isAbsolute, relative, sep } from 'path';
import { getWorkspace } from '@/store';
import { listDirectory, searchFiles, isPathWithinWorkspace } from '@/services/files';
import { getFilePreview } from '@/services/filePreview';
import { getGitStatus, attachGitStatusToEntries, getGitFileDiff } from '@/services/gitStatus';

function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  return path;
}

/**
 * Resolves an optional `root` query param to an allowed absolute root path.
 * When `root` is provided it must exactly match either the workspace.path or
 * one of additionalPaths. Falls back to workspace.path when missing/invalid.
 * Returns the selected root and a boolean indicating whether it is the main
 * workspace path.
 */
function resolveRoot(
  workspace: { path: string; additionalPaths: string[] },
  rootQuery?: string,
): { root: string; isMain: boolean } {
  const main = resolve(workspace.path);
  if (!rootQuery) return { root: main, isMain: true };
  const resolved = resolve(rootQuery);
  if (resolved === main) return { root: main, isMain: true };
  for (const p of workspace.additionalPaths) {
    if (resolve(p) === resolved) return { root: resolved, isMain: false };
  }
  return { root: main, isMain: true };
}

export function registerFileRoutes(app: Hono): void {
  app.get('/api/workspaces/:id/files', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path') || '';
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const showHidden = c.req.query('showHidden') !== 'false';
    const rootQuery = c.req.query('root');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { root, isMain } = resolveRoot(workspace, rootQuery);

    try {
      if (search) {
        const files = await searchFiles(root, search, limit, showHidden, c.req.raw.signal);
        if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
        return c.json({ files, currentPath: '', mode: 'search', root, isMain });
      }

      const fullPath = join(root, path);

      if (!isPathWithinWorkspace(fullPath, workspace.path, workspace.additionalPaths)) {
        return c.json({ error: 'Forbidden', message: 'Path outside workspace' }, 403);
      }

      const files = await listDirectory(fullPath, showHidden);

      let gitStatus;
      try {
        gitStatus = await getGitStatus(root);
      } catch {
        gitStatus = null;
      }

      const filesWithGit = gitStatus
        ? attachGitStatusToEntries(files, fullPath, gitStatus)
        : files;

      return c.json({
        files: filesWithGit,
        currentPath: path,
        mode: 'browse',
        root,
        isMain,
        git: gitStatus?.availability,
      });
    } catch (_err: unknown) {
      const _message = _err instanceof Error ? _err.message : 'Unknown error';
      return c.json({ error: 'Not Found', message: 'Path not found' }, 404);
    }
  });

  app.get('/api/workspaces/:id/git/status', async (c) => {
    const workspaceId = c.req.param('id');
    const rootQuery = c.req.query('root');

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { root } = resolveRoot(workspace, rootQuery);

    try {
      const gitStatus = await getGitStatus(root);
      const resolvedRoot = resolve(root);
      const gitRoot = gitStatus.availability.root;

      const files = Array.from(gitStatus.files.entries())
        .filter(([, summary]) => summary.status !== 'ignored')
        .flatMap(([filePath, summary]) => {
          // Convert repo-relative path to selected-root-relative path.
          let rootRelative: string | null = filePath;
          if (gitRoot) {
            const abs = resolve(gitRoot, filePath.split('/').join(sep));
            const rel = relative(resolvedRoot, abs);
            // Skip files outside the selected root.
            if (rel.startsWith('..') || isAbsolute(rel)) rootRelative = null;
            else rootRelative = rel.split(sep).join('/');
          }
          if (rootRelative === null) return [];
          return [{ path: rootRelative, git: summary }];
        })
        .sort((a, b) => a.path.localeCompare(b.path));

      return c.json({
        availability: gitStatus.availability,
        files,
        root,
      });
    } catch (_err: unknown) {
      return c.json({
        availability: { available: false, reason: 'git_error' as const },
        files: [],
        root,
      });
    }
  });

  app.get('/api/workspaces/:id/file-preview', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path');
    const rootQuery = c.req.query('root');

    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path query parameter is required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { root } = resolveRoot(workspace, rootQuery);

    try {
      const preview = await getFilePreview(root, path, workspace.additionalPaths);
      return c.json(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message === 'Cannot preview a directory') {
        return c.json({ error: 'Bad Request', message }, 400);
      }

      if (message === 'Path outside workspace') {
        return c.json({ error: 'Forbidden', message }, 403);
      }

      return c.json({ error: 'Not Found', message }, 404);
    }
  });

  app.get('/api/workspaces/:id/git/diff', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path');
    const rootQuery = c.req.query('root');

    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path query parameter is required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const { root } = resolveRoot(workspace, rootQuery);
    const diff = await getGitFileDiff(root, path, workspace.additionalPaths);
    return c.json(diff);
  });

  app.get('/api/fs/browse', async (c) => {
    // When no path is provided (or it's empty), default to home directory.
    const path = c.req.query('path') || homedir();
    // Expand ~ to homedir, and resolve to absolute. Relative paths are
    // anchored to homedir (not process.cwd()) so browse/parent navigation
    // stays consistent with the default regardless of dev vs production.
    const expanded = path.startsWith('~') ? expandPath(path) : path;
    const resolvedPath = resolve(isAbsolute(expanded) ? expanded : join(homedir(), expanded));
    const isRoot = resolvedPath === dirname(resolvedPath);

    try {
      const files = await listDirectory(resolvedPath);
      return c.json({ files, currentPath: resolvedPath, mode: 'browse', isRoot });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
  });

  app.get('/api/fs/parent', async (c) => {
    const inputPath = c.req.query('path') || homedir();
    // Resolve relative paths against homedir (not process.cwd()) for
    // consistency with /api/fs/browse defaults.
    const resolvedInput = isAbsolute(inputPath) ? inputPath : join(homedir(), inputPath);
    const resolvedPath = resolve(resolvedInput);
    const parent = dirname(resolvedPath);
    const isRoot = resolvedPath === parent;

    try {
      const files = await listDirectory(parent);
      return c.json({ files, currentPath: resolve(parent), mode: 'browse', isRoot });
    } catch (_err: unknown) {
      return c.json({ error: 'Bad Request', message: 'Cannot access path' }, 400);
    }
  });

  app.get('/api/fs/drives', async (c) => {
    const platform = process.platform;

    if (platform === 'win32') {
      const drives: string[] = [];
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        try {
          accessSync(`${letter}:\\`, constants.R_OK);
          drives.push(`${letter}:\\`);
        } catch {
          // Drive not available, skip
        }
      }
      return c.json({ drives });
    }

    return c.json({ drives: ['/'] });
  });
}
