import { describe, test, expect } from 'bun:test';
import { _internal, attachGitStatusToEntries, clearGitStatusCache } from '@/services/gitStatus';
import type { FileEntry, GitDiffSummary, GitAvailability } from '@jean2/sdk';

const { parsePorcelainStatus, parseNumstat, aggregateDirectoryStatus, mapStatus } = _internal;

describe('gitStatus', () => {
  describe('mapStatus', () => {
    test('maps untracked files', () => {
      expect(mapStatus('?', '?')).toBe('untracked');
    });

    test('maps ignored files', () => {
      expect(mapStatus('!', '!')).toBe('ignored');
    });

    test('maps staged modified', () => {
      expect(mapStatus('M', ' ')).toBe('modified');
    });

    test('maps unstaged modified', () => {
      expect(mapStatus(' ', 'M')).toBe('modified');
    });

    test('maps staged added', () => {
      expect(mapStatus('A', ' ')).toBe('added');
    });

    test('maps deleted', () => {
      expect(mapStatus(' ', 'D')).toBe('deleted');
      expect(mapStatus('D', ' ')).toBe('deleted');
    });

    test('maps renamed', () => {
      expect(mapStatus('R', ' ')).toBe('renamed');
      expect(mapStatus(' ', 'R')).toBe('renamed');
    });

    test('maps copied', () => {
      expect(mapStatus('C', ' ')).toBe('copied');
    });

    test('maps conflicted - both modified (UU)', () => {
      expect(mapStatus('U', 'U')).toBe('conflicted');
    });

    test('maps conflicted - added by both (AA)', () => {
      expect(mapStatus('A', 'A')).toBe('conflicted');
    });

    test('maps conflicted - deleted by both (DD)', () => {
      expect(mapStatus('D', 'D')).toBe('conflicted');
    });

    test('maps conflicted - ours (U)', () => {
      expect(mapStatus('U', ' ')).toBe('conflicted');
    });
  });

  describe('parsePorcelainStatus', () => {
    test('parses empty output', () => {
      const result = parsePorcelainStatus('');
      expect(result.size).toBe(0);
    });

    test('parses modified file', () => {
      const result = parsePorcelainStatus(' M packages/client/src/components/files/FileTree.tsx');
      const entry = result.get('packages/client/src/components/files/FileTree.tsx');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('modified');
      expect(entry!.staged).toBe(false);
      expect(entry!.unstaged).toBe(true);
    });

    test('parses staged added file', () => {
      const result = parsePorcelainStatus('A  packages/server/src/services/gitStatus.ts');
      const entry = result.get('packages/server/src/services/gitStatus.ts');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('added');
      expect(entry!.staged).toBe(true);
      expect(entry!.unstaged).toBe(false);
    });

    test('parses untracked file', () => {
      const result = parsePorcelainStatus('?? packages/client/src/components/files/GitStatusBadge.tsx');
      const entry = result.get('packages/client/src/components/files/GitStatusBadge.tsx');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('untracked');
      expect(entry!.staged).toBe(false);
      expect(entry!.unstaged).toBe(false);
    });

    test('parses deleted file', () => {
      const result = parsePorcelainStatus(' D README.md');
      const entry = result.get('README.md');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('deleted');
    });

    test('parses renamed file with arrow', () => {
      const result = parsePorcelainStatus('R  old/path.ts -> new/path.ts');
      const entry = result.get('new/path.ts');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('renamed');
      expect(entry!.oldPath).toBe('old/path.ts');
    });

    test('parses conflicted file', () => {
      const result = parsePorcelainStatus('UU conflicted.ts');
      const entry = result.get('conflicted.ts');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('conflicted');
    });

    test('parses multiple lines', () => {
      const output = [
        ' M file1.ts',
        'A  file2.ts',
        '?? file3.ts',
      ].join('\n');
      const result = parsePorcelainStatus(output);
      expect(result.size).toBe(3);
    });
  });

  describe('parseNumstat', () => {
    test('parses empty output', () => {
      const result = parseNumstat('');
      expect(result.size).toBe(0);
    });

    test('parses normal numstat line', () => {
      const result = parseNumstat('12\t3\tpackages/client/src/components/files/FileTree.tsx');
      const entry = result.get('packages/client/src/components/files/FileTree.tsx');
      expect(entry).toBeDefined();
      expect(entry!.additions).toBe(12);
      expect(entry!.deletions).toBe(3);
    });

    test('parses binary file numstat', () => {
      const result = parseNumstat('-\t-\tbinary-file.png');
      const entry = result.get('binary-file.png');
      expect(entry).toBeDefined();
      expect(entry!.additions).toBeUndefined();
      expect(entry!.deletions).toBeUndefined();
    });

    test('parses multiple lines', () => {
      const output = [
        '12\t3\tfile1.ts',
        '5\t0\tfile2.ts',
      ].join('\n');
      const result = parseNumstat(output);
      expect(result.size).toBe(2);
    });
  });

  describe('aggregateDirectoryStatus', () => {
    test('returns undefined for empty map', () => {
      const result = aggregateDirectoryStatus('src', new Map());
      expect(result).toBeUndefined();
    });

    test('returns undefined when no descendants match', () => {
      const files = new Map<string, GitDiffSummary>([
        ['other/file.ts', { status: 'modified', staged: false, unstaged: true }],
      ]);
      const result = aggregateDirectoryStatus('src', files);
      expect(result).toBeUndefined();
    });

    test('aggregates descendant files', () => {
      const files = new Map<string, GitDiffSummary>([
        ['src/file1.ts', { status: 'modified', staged: false, unstaged: true, additions: 5, deletions: 2 }],
        ['src/file2.ts', { status: 'added', staged: true, unstaged: false, additions: 10, deletions: 0 }],
      ]);
      const result = aggregateDirectoryStatus('src', files);
      expect(result).toBeDefined();
      expect(result!.status).toBe('added');
      expect(result!.staged).toBe(true);
      expect(result!.unstaged).toBe(true);
      expect(result!.additions).toBe(15);
      expect(result!.deletions).toBe(2);
    });

    test('picks highest priority status', () => {
      const files = new Map<string, GitDiffSummary>([
        ['src/a.ts', { status: 'modified', staged: false, unstaged: true }],
        ['src/b.ts', { status: 'deleted', staged: true, unstaged: false }],
        ['src/c.ts', { status: 'untracked', staged: false, unstaged: false }],
      ]);
      const result = aggregateDirectoryStatus('src', files);
      expect(result!.status).toBe('deleted');
    });

    test('handles deep descendants', () => {
      const files = new Map<string, GitDiffSummary>([
        ['src/components/files/FileTree.tsx', { status: 'modified', staged: false, unstaged: true }],
      ]);
      const result = aggregateDirectoryStatus('src', files);
      expect(result).toBeDefined();
      expect(result!.status).toBe('modified');
    });

    test('leaves additions/deletions undefined when all binary', () => {
      const files = new Map<string, GitDiffSummary>([
        ['assets/logo.png', { status: 'added', staged: true, unstaged: false }],
      ]);
      const result = aggregateDirectoryStatus('assets', files);
      expect(result!.additions).toBeUndefined();
      expect(result!.deletions).toBeUndefined();
    });
  });

  describe('attachGitStatusToEntries', () => {
    test('returns entries unchanged when git not available', () => {
      const entries: FileEntry[] = [
        { name: 'file.ts', type: 'file', path: 'file.ts' },
      ];
      const gitStatus = {
        availability: { available: false, reason: 'git_not_installed' as const },
        files: new Map<string, GitDiffSummary>(),
      };
      const result = attachGitStatusToEntries(entries, '/workspace', gitStatus);
      expect(result[0].git).toBeUndefined();
    });

    test('attaches git status to files', () => {
      const entries: FileEntry[] = [
        { name: 'FileTree.tsx', type: 'file', path: 'FileTree.tsx', extension: '.tsx' },
        { name: 'files', type: 'directory', path: 'files' },
      ];
      const gitStatus = {
        availability: { available: true, root: '/workspace' } as GitAvailability,
        files: new Map<string, GitDiffSummary>([
          ['src/FileTree.tsx', { status: 'modified', staged: false, unstaged: true, additions: 12, deletions: 3 }],
        ]),
      };
      const result = attachGitStatusToEntries(entries, '/workspace/src', gitStatus);
      expect(result[0].git).toBeDefined();
      expect(result[0].git!.status).toBe('modified');
      expect(result[0].git!.additions).toBe(12);
    });

    test('attaches aggregated status to directories', () => {
      const entries: FileEntry[] = [
        { name: 'components', type: 'directory', path: 'components' },
      ];
      const gitStatus = {
        availability: { available: true, root: '/workspace' } as GitAvailability,
        files: new Map<string, GitDiffSummary>([
          ['src/components/a.ts', { status: 'modified', staged: false, unstaged: true, additions: 5, deletions: 1 }],
          ['src/components/b.ts', { status: 'added', staged: true, unstaged: false, additions: 3, deletions: 0 }],
        ]),
      };
      const result = attachGitStatusToEntries(entries, '/workspace/src', gitStatus);
      expect(result[0].git).toBeDefined();
      expect(result[0].git!.status).toBe('added');
      expect(result[0].git!.additions).toBe(8);
      expect(result[0].git!.deletions).toBe(1);
    });

    test('returns entries unchanged when path is outside repo', () => {
      const entries: FileEntry[] = [
        { name: 'file.ts', type: 'file', path: 'file.ts' },
      ];
      const gitStatus = {
        availability: { available: true, root: '/other/repo' } as GitAvailability,
        files: new Map<string, GitDiffSummary>(),
      };
      const result = attachGitStatusToEntries(entries, '/workspace', gitStatus);
      expect(result[0].git).toBeUndefined();
    });
  });
});
