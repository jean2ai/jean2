import { describe, expect, test } from 'bun:test';
import { compressRecords } from '@/core/tool-output/compress-records';

const baseConfig = { minChars: 100, targetChars: 1000, minSavingsRatio: 0.2 };

function buildRecords(count: number, make: (i: number) => Record<string, unknown>): Record<string, unknown> {
  return { matches: Array.from({ length: count }, (_, i) => make(i)) };
}

describe('compressRecords', () => {
  test('returns null when fewer than MIN_ITEMS', () => {
    const output = buildRecords(10, i => ({ file: `f${i}.ts` }));
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    expect(result).toBeNull();
  });

  test('returns deterministic output for identical input', () => {
    const output = buildRecords(40, i => ({ file: `f${i}.ts`, line: i }));
    const a = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    const b = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    expect(a?.payload.modelChars).toBe(b?.payload.modelChars);
    expect(JSON.stringify(a?.payload.summary)).toBe(JSON.stringify(b?.payload.summary));
  });

  test('preserves error and failure records in head/tail/rare selection', () => {
    const output = buildRecords(40, i => {
      if (i === 7) return { file: 'broken.ts', error: 'fatal exception' };
      if (i === 12) return { file: 'warn.ts', status: 'failed' };
      if (i === 33) return { file: 'kind.ts', kind: 'critical' };
      return { file: `f${i}.ts`, status: 'ok' };
    });
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    expect(result).not.toBeNull();
    const preservedItems = (result!.payload.preserved as { items: Array<{ index: number }> }).items;
    const indices = new Set(preservedItems.map(p => p.index));
    expect(indices.has(7)).toBe(true);
    expect(indices.has(12)).toBe(true);
    expect(indices.has(33)).toBe(true);
  });

  test('omits ordinary records instead of preserving the entire array', () => {
    const output = buildRecords(200, i => ({
      file: `src/file-${i}.ts`,
      line: i,
      text: 'ordinary matching line',
    }));
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 20_000,
    });
    const summary = result!.payload.summary as { shownItems: number; omittedItems: number };

    expect(summary.shownItems).toBeLessThan(200);
    expect(summary.omittedItems).toBeGreaterThan(0);
  });

  test('includes first and last items regardless of content', () => {
    const output = buildRecords(40, i => ({ file: `f${i}.ts` }));
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    const preservedItems = (result!.payload.preserved as { items: Array<{ index: number }> }).items;
    const indices = preservedItems.map(p => p.index);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(39);
  });

  test('reports numeric stats with finite values only', () => {
    const output = buildRecords(40, i => ({
      file: `f${i}.ts`,
      bytes: i * 10,
      bad: Number.isFinite(NaN) ? NaN : (i === 5 ? Number.POSITIVE_INFINITY : i + 0.5),
    }));
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    const numeric = (result!.payload.summary as Record<string, unknown>).numericStats as Record<string, { min: number; max: number }>;
    expect(numeric.bytes?.min).toBe(0);
    expect(numeric.bytes?.max).toBe(390);
    expect(numeric.bad?.max).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  test('returns null when array key does not exist', () => {
    const output = { different: [] };
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: baseConfig,
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    expect(result).toBeNull();
  });

  test('respects min chars threshold', () => {
    const output = buildRecords(40, i => ({ file: `f${i}.ts` }));
    const result = compressRecords({
      output,
      arrayKey: 'matches',
      config: { ...baseConfig, minChars: 100_000 },
      toolName: 'grep',
      retrievalId: 'r1',
      originalChars: 10_000,
    });
    expect(result).toBeNull();
  });
});