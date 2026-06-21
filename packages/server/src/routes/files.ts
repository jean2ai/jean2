import type { Hono } from 'hono';
import { accessSync, constants } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';
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

export function registerFileRoutes(app: Hono): void {
  app.get('/api/workspaces/:id/files', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path') || '';
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const showHidden = c.req.query('showHidden') !== 'false';

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
      if (search) {
        const files = await searchFiles(workspace.path, search, limit, showHidden, c.req.raw.signal);
        if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
        return c.json({ files, currentPath: '', mode: 'search' });
      }

      const fullPath = join(workspace.path, path);

      if (!isPathWithinWorkspace(fullPath, workspace.path, workspace.additionalPaths)) {
        return c.json({ error: 'Forbidden', message: 'Path outside workspace' }, 403);
      }

      const files = await listDirectory(fullPath, showHidden);

      let gitStatus;
      try {
        gitStatus = await getGitStatus(workspace.path);
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
        git: gitStatus?.availability,
      });
    } catch (_err: unknown) {
      const _message = _err instanceof Error ? _err.message : 'Unknown error';
      return c.json({ error: 'Not Found', message: 'Path not found' }, 404);
    }
  });

  app.get('/api/workspaces/:id/file-preview', async (c) => {
    const workspaceId = c.req.param('id');
    const path = c.req.query('path');

    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path query parameter is required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    try {
      const preview = await getFilePreview(workspace.path, path, workspace.additionalPaths);
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

    if (!path) {
      return c.json({ error: 'Bad Request', message: 'Path query parameter is required' }, 400);
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ error: 'Not Found', message: 'Workspace not found' }, 404);
    }

    const diff = await getGitFileDiff(workspace.path, path, workspace.additionalPaths);
    return c.json(diff);
  });

  app.get('/api/fs/browse', async (c) => {
    // When no path is provided (or it's empty), default to home directory.
    const path = c.req.query('path') || homedir();
    // Expand ~ to homedir, and resolve to absolute. We pass homedir() to
    // resolve() as the base for any relative path so that browse/parent
    // navigation stays consistent with the default (home) rather than
    // process.cwd(), which differs between dev and production.
    const expanded = path.startsWith('~') ? expandPath(path) : path;
    const resolvedPath = resolve(expanded.startsWith('/') ? expanded : join(homedir(), expanded));
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
    const resolvedInput = inputPath.startsWith('/') ? inputPath : join(homedir(), inputPath);
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
