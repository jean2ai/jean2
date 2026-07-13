import { describe, test, expect } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

describe('file query keys - preview and diff isolation', () => {
  test('preview key differs by path', () => {
    const key1 = queryKeys.files.preview('ws-1', '/src/a.ts');
    const key2 = queryKeys.files.preview('ws-1', '/src/b.ts');
    expect(key1).not.toEqual(key2);
  });

  test('preview key differs by workspace', () => {
    const key1 = queryKeys.files.preview('ws-1', '/src/a.ts');
    const key2 = queryKeys.files.preview('ws-2', '/src/a.ts');
    expect(key1).not.toEqual(key2);
  });

  test('preview key differs by root', () => {
    const key1 = queryKeys.files.preview('ws-1', '/src/a.ts', undefined);
    const key2 = queryKeys.files.preview('ws-1', '/src/a.ts', '/custom/root');
    expect(key1).not.toEqual(key2);
  });

  test('git-diff key differs by path', () => {
    const key1 = queryKeys.files.gitDiff('ws-1', '/src/a.ts');
    const key2 = queryKeys.files.gitDiff('ws-1', '/src/b.ts');
    expect(key1).not.toEqual(key2);
  });

  test('browse prefix does not match preview keys', () => {
    const browsePrefix = queryKeys.files.browsePrefix;
    const previewKey = queryKeys.files.preview('ws-1', '/src/a.ts');

    expect(browsePrefix).not.toEqual(previewKey.slice(0, browsePrefix.length));
  });

  test('browse prefix matches browse query keys', () => {
    const browsePrefix = queryKeys.files.browsePrefix;
    const browseKey = queryKeys.files.browse('ws-1', '/src');

    expect(browseKey.slice(0, browsePrefix.length)).toEqual(browsePrefix);
  });

  test('git-status prefix does not match git-diff keys', () => {
    const gitStatusPrefix = queryKeys.files.gitStatusPrefix;
    const gitDiffKey = queryKeys.files.gitDiff('ws-1', '/src/a.ts');

    expect(gitDiffKey.slice(0, gitStatusPrefix.length)).not.toEqual(gitStatusPrefix);
  });

  test('search prefix matches search query keys', () => {
    const searchPrefix = queryKeys.files.searchPrefix;
    const searchKey = queryKeys.files.search('ws-1', 'test', undefined);

    expect(searchKey.slice(0, searchPrefix.length)).toEqual(searchPrefix);
  });

  test('git-status prefix matches git-status query keys', () => {
    const gitStatusPrefix = queryKeys.files.gitStatusPrefix;
    const gitStatusKey = queryKeys.files.gitStatus('ws-1', undefined);

    expect(gitStatusKey.slice(0, gitStatusPrefix.length)).toEqual(gitStatusPrefix);
  });
});
