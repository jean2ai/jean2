import { describe, test, expect } from 'vitest';
import { generateDiff, generateMultiEditDiff } from '@/utils/diff';

describe('generateDiff', () => {
  test('generates diff for added lines', () => {
    const result = generateDiff('', 'hello\nworld');
    expect(result.hunks.length).toBeGreaterThan(0);
    expect(result.hunks[0].changes.length).toBeGreaterThan(0);
    expect(result.path).toBe('file');
  });

  test('generates diff for removed lines', () => {
    const result = generateDiff('hello\nworld', '');
    expect(result.hunks.length).toBeGreaterThan(0);
    const removedChanges = result.hunks[0].changes.filter((c) => c.type === 'removed');
    expect(removedChanges.length).toBeGreaterThan(0);
  });

  test('generates diff for modified lines', () => {
    const result = generateDiff('hello\nworld', 'hello\nchanged');
    expect(result.hunks.length).toBeGreaterThan(0);
    const changes = result.hunks[0].changes;
    const added = changes.filter((c) => c.type === 'added');
    const removed = changes.filter((c) => c.type === 'removed');
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
  });

  test('returns empty hunks for identical content', () => {
    const result = generateDiff('same\ncontent', 'same\ncontent');
    expect(result.hunks).toHaveLength(0);
  });

  test('uses custom filename', () => {
    const result = generateDiff('a', 'b', 'my-file.ts');
    expect(result.path).toBe('my-file.ts');
  });

  test('tracks line numbers for added changes', () => {
    const result = generateDiff('', 'line1\nline2');
    const added = result.hunks[0].changes.filter((c) => c.type === 'added');
    expect(added[0].newLineNumber).toBeDefined();
  });

  test('tracks line numbers for removed changes', () => {
    const result = generateDiff('line1\nline2', '');
    const removed = result.hunks[0].changes.filter((c) => c.type === 'removed');
    expect(removed[0].lineNumber).toBeDefined();
  });

  test('includes context lines in diff', () => {
    const oldContent = 'keep1\nchange\nkeep2';
    const newContent = 'keep1\nmodified\nkeep2';
    const result = generateDiff(oldContent, newContent);
    const context = result.hunks[0].changes.filter((c) => c.type === 'context');
    expect(context.length).toBeGreaterThan(0);
  });
});

describe('generateMultiEditDiff', () => {
  test('generates diff for multiple edits', () => {
    const edits = [
      { oldString: 'hello', newString: 'world' },
      { oldString: 'foo', newString: 'bar' },
    ];
    const results = generateMultiEditDiff(edits);
    expect(results).toHaveLength(2);
    expect(results[0].path).toBe('edit-1');
    expect(results[1].path).toBe('edit-2');
  });

  test('returns empty array for no edits', () => {
    expect(generateMultiEditDiff([])).toEqual([]);
  });
});
