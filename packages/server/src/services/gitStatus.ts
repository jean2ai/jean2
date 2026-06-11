import { relative, normalize, sep } from 'path';
import type { FileEntry, GitAvailability, GitDiffSummary, GitFileStatus } from '@jean2/sdk';

export interface GitStatusResult {
  availability: GitAvailability;
  files: Map<string, GitDiffSummary>;
}

interface CacheEntry {
  result: GitStatusResult;
  mtime: number;
}

const CACHE_TTL = 2_000;
const cache = new Map<string, CacheEntry>();

export function clearGitStatusCache(): void {
  cache.clear();
}

function normalizePath(p: string): string {
  return p.split(sep).join('/');
}

function mapStatus(x: string, y: string): GitFileStatus {
  if (x === '?' && y === '?') return 'untracked';
  if (x === '!' && y === '!') return 'ignored';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'conflicted';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'C' || y === 'C') return 'copied';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  return 'modified';
}

function parsePorcelainStatus(output: string): Map<string, { status: GitFileStatus; staged: boolean; unstaged: boolean; oldPath?: string }> {
  const result = new Map<string, { status: GitFileStatus; staged: boolean; unstaged: boolean; oldPath?: string }>();

  if (!output.trim()) return result;

  for (const line of output.split('\n')) {
    if (!line) continue;

    const x = line[0];
    const y = line[1];
    const status = mapStatus(x, y);

    const staged = x !== ' ' && x !== '?';
    const unstaged = y !== ' ' && y !== '?';

    let filePath = line.slice(3);
    let oldPath: string | undefined;

    if ((status === 'renamed' || status === 'copied') && filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ');
      oldPath = parts[0];
      filePath = parts[1];
    }

    filePath = normalizePath(filePath);

    result.set(filePath, { status, staged, unstaged, oldPath });
  }

  return result;
}

function parseNumstat(output: string): Map<string, { additions?: number; deletions?: number }> {
  const result = new Map<string, { additions?: number; deletions?: number }>();

  if (!output.trim()) return result;

  for (const line of output.split('\n')) {
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const addStr = parts[0];
    const delStr = parts[1];
    const filePath = normalizePath(parts[2]);

    const additions = addStr === '-' ? undefined : parseInt(addStr, 10);
    const deletions = delStr === '-' ? undefined : parseInt(delStr, 10);

    result.set(filePath, { additions, deletions });
  }

  return result;
}

async function execGit(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  try {
    const proc = Bun.spawn(['git', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    await new Response(proc.stderr).text();

    return { stdout: stdout.trim(), exitCode };
  } catch {
    return { stdout: '', exitCode: 1 };
  }
}

async function detectGitAvailability(workspacePath: string): Promise<GitAvailability> {
  const versionResult = await execGit(['--version']);
  if (versionResult.exitCode !== 0) {
    return { available: false, reason: 'git_not_installed' };
  }

  const rootResult = await execGit(['-C', workspacePath, 'rev-parse', '--show-toplevel']);
  if (rootResult.exitCode !== 0) {
    return { available: false, reason: 'not_a_git_repo' };
  }

  return { available: true, root: rootResult.stdout };
}

export async function getGitStatus(workspacePath: string): Promise<GitStatusResult> {
  const now = Date.now();
  const cached = cache.get(workspacePath);
  if (cached && now - cached.mtime < CACHE_TTL) {
    return cached.result;
  }

  const availability = await detectGitAvailability(workspacePath);

  if (!availability.available) {
    const result: GitStatusResult = { availability, files: new Map() };
    cache.set(workspacePath, { result, mtime: now });
    return result;
  }

  try {
    const [statusResult, numstatResult, cachedNumstatResult] = await Promise.all([
      execGit(['-C', workspacePath, 'status', '--porcelain=v1', '--untracked-files=all']),
      execGit(['-C', workspacePath, 'diff', '--numstat']),
      execGit(['-C', workspacePath, 'diff', '--cached', '--numstat']),
    ]);

    const statusMap = parsePorcelainStatus(statusResult.stdout);
    const numstatMap = parseNumstat(numstatResult.stdout);
    const cachedNumstatMap = parseNumstat(cachedNumstatResult.stdout);

    const files = new Map<string, GitDiffSummary>();

    for (const [filePath, statusInfo] of statusMap) {
      const unstagedStat = numstatMap.get(filePath);
      const stagedStat = cachedNumstatMap.get(filePath);

      let additions: number | undefined;
      let deletions: number | undefined;

      if (unstagedStat || stagedStat) {
        additions = (unstagedStat?.additions ?? 0) + (stagedStat?.additions ?? 0);
        deletions = (unstagedStat?.deletions ?? 0) + (stagedStat?.deletions ?? 0);

        if (unstagedStat?.additions === undefined && stagedStat?.additions === undefined) {
          additions = undefined;
        }
        if (unstagedStat?.deletions === undefined && stagedStat?.deletions === undefined) {
          deletions = undefined;
        }
      }

      files.set(filePath, {
        status: statusInfo.status,
        staged: statusInfo.staged,
        unstaged: statusInfo.unstaged,
        additions,
        deletions,
        oldPath: statusInfo.oldPath,
      });
    }

    const result: GitStatusResult = { availability, files };
    cache.set(workspacePath, { result, mtime: now });
    return result;
  } catch {
    const result: GitStatusResult = {
      availability: { available: false, reason: 'git_error' },
      files: new Map(),
    };
    cache.set(workspacePath, { result, mtime: now });
    return result;
  }
}

const STATUS_PRIORITY: Record<GitFileStatus, number> = {
  conflicted: 7,
  deleted: 6,
  renamed: 5,
  added: 4,
  untracked: 3,
  modified: 2,
  copied: 1,
  ignored: 0,
};

function aggregateDirectoryStatus(
  dirRepoPath: string,
  gitFiles: Map<string, GitDiffSummary>,
): GitDiffSummary | undefined {
  const prefix = dirRepoPath + '/';
  let hasAny = false;
  let staged = false;
  let unstaged = false;
  let additions = 0;
  let deletions = 0;
  let additionsDefined = false;
  let deletionsDefined = false;
  let highestStatus: GitFileStatus = 'modified';
  let highestPriority = -1;

  for (const [filePath, summary] of gitFiles) {
    if (!filePath.startsWith(prefix)) continue;

    hasAny = true;
    if (summary.staged) staged = true;
    if (summary.unstaged) unstaged = true;

    if (summary.additions !== undefined) {
      additions += summary.additions;
      additionsDefined = true;
    }
    if (summary.deletions !== undefined) {
      deletions += summary.deletions;
      deletionsDefined = true;
    }

    const priority = STATUS_PRIORITY[summary.status];
    if (priority > highestPriority) {
      highestPriority = priority;
      highestStatus = summary.status;
    }
  }

  if (!hasAny) return undefined;

  return {
    status: highestStatus,
    staged,
    unstaged,
    additions: additionsDefined ? additions : undefined,
    deletions: deletionsDefined ? deletions : undefined,
  };
}

export function attachGitStatusToEntries(
  entries: FileEntry[],
  listedPath: string,
  gitStatus: GitStatusResult,
): FileEntry[] {
  if (!gitStatus.availability.available || !gitStatus.availability.root) {
    return entries;
  }

  const gitRoot = gitStatus.availability.root;

  const prefix = normalizePath(relative(gitRoot, normalize(listedPath)));
  if (prefix.startsWith('..')) {
    return entries;
  }

  return entries.map((entry) => {
    const entryRepoPath = prefix ? `${prefix}/${entry.path}` : entry.path;

    if (entry.type === 'file') {
      const fileStatus = gitStatus.files.get(entryRepoPath);
      if (fileStatus) {
        return { ...entry, git: fileStatus };
      }
      return entry;
    }

    const dirStatus = aggregateDirectoryStatus(entryRepoPath, gitStatus.files);
    if (dirStatus) {
      return { ...entry, git: dirStatus };
    }

    const exactMatch = gitStatus.files.get(entryRepoPath);
    if (exactMatch) {
      return { ...entry, git: exactMatch };
    }

    return entry;
  });
}

export const _internal = {
  parsePorcelainStatus,
  parseNumstat,
  aggregateDirectoryStatus,
  mapStatus,
};
