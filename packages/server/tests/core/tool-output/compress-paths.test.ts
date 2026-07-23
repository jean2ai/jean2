import { describe, expect, test } from 'bun:test';
import { compressPaths } from '@/core/tool-output/compress-paths';

const config = { minChars: 100, targetChars: 1000, minSavingsRatio: 0.2 };

function buildPaths(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `src/dir${i % 5}/file-${i}.ts`);
}

describe('compressPaths', () => {
  test('returns null for fewer than 100 paths', () => {
    expect(compressPaths({
      paths: buildPaths(50),
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    })).toBeNull();
  });

  test('returns null for non-string entries', () => {
    const paths = buildPaths(150) as unknown[];
    paths[10] = 42;
    expect(compressPaths({
      paths: paths as string[],
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    })).toBeNull();
  });

  test('produces deterministic aggregate counts', () => {
    const paths = buildPaths(200);
    const a = compressPaths({
      paths,
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    });
    const b = compressPaths({
      paths,
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    });
    expect(JSON.stringify(a?.payload.summary)).toBe(JSON.stringify(b?.payload.summary));
  });

  test('preserves head and tail samples in source order', () => {
    const paths = buildPaths(200);
    const result = compressPaths({
      paths,
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    });
    const items = (result!.payload.preserved as { items: Array<{ index: number }> }).items;
    const indices = items.map(i => i.index);
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i + 1]).toBeGreaterThan(indices[i]);
    }
    expect(indices).toContain(0);
    expect(indices).toContain(paths.length - 1);
  });

  test('aggregates by directory and extension', () => {
    const paths = [
      ...Array.from({ length: 50 }, (_i) => `src/dirA/file-${_i}.ts`),
      ...Array.from({ length: 50 }, (_i) => `src/dirB/file-${_i}.js`),
      ...Array.from({ length: 50 }, (_i) => `lib/dirA/file-${_i}.ts`),
      ...Array.from({ length: 50 }, () => `README`),
    ];
    const result = compressPaths({
      paths,
      config,
      toolName: 'glob',
      retrievalId: 'r1',
      arrayKey: 'files',
      originalChars: 10_000,
    });
    const summary = result!.payload.summary as {
      topDirs: Array<{ key: string; count: number }>;
      topExtensions: Array<{ key: string; count: number }>;
      withoutExtensionCount: number;
    };
    expect(summary.topDirs.length).toBeGreaterThan(0);
    expect(summary.topExtensions.find(e => e.key === 'ts')?.count).toBe(100);
    expect(summary.withoutExtensionCount).toBe(50);
  });
});