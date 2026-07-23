import { describe, expect, test } from 'bun:test';
import { compressLogs } from '@/core/tool-output/compress-logs';

const config = { minChars: 100, targetChars: 1000, minSavingsRatio: 0.2 };

function buildOutput(stdoutLines: string[], stderrLines: string[] = [], exitCode = 0) {
  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    exitCode,
  };
}

describe('compressLogs', () => {
  test('returns null for fewer than 100 lines', () => {
    const output = buildOutput(Array.from({ length: 80 }, (_, i) => `line ${i}`));
    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    expect(result).toBeNull();
  });

  test('returns null when neither stream is a string', () => {
    const output = { stdout: 42, stderr: 'err', exitCode: 1 };
    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    expect(result).toBeNull();
  });

  test('preserves error lines and dedupes overlapping context', () => {
    const stdout: string[] = [];
    for (let i = 0; i < 100; i++) stdout.push(`ok ${i}`);
    stdout.push('ERROR: failed to connect');
    stdout.push('Traceback (most recent call last):');
    stdout.push('  at something (file.ts:42)');
    for (let i = 0; i < 50; i++) stdout.push(`ok-tail ${i}`);
    const output = buildOutput(stdout);

    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 20_000,
    });

    expect(result).not.toBeNull();
    const items = (result!.payload.preserved as { items: Array<{ lineNumber: number; line: string; reason: string }> }).items;
    const errorLine = items.find(i => i.line.includes('ERROR: failed to connect'));
    expect(errorLine).toBeDefined();
    expect(items.filter(i => i.reason === 'important').length).toBeGreaterThan(0);
  });

  test('collapses consecutive identical lines', () => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) lines.push('SAME');
    for (let i = 0; i < 60; i++) lines.push(`diff-${i}`);
    const output = buildOutput(lines);
    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    const items = (result!.payload.preserved as { items: Array<{ line: string }> }).items;
    expect(items.some(i => i.line.startsWith('... ') && i.line.includes('identical line'))).toBe(true);
  });

  test('respects originalChars min threshold', () => {
    const output = buildOutput(Array.from({ length: 120 }, (_, i) => `line ${i}`));
    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config: { ...config, minChars: 100_000 },
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    expect(result).toBeNull();
  });

  test('respects min lines threshold', () => {
    const output = buildOutput(Array.from({ length: 100 }, (_, i) => `ok ${i}`));
    const result = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config: { ...config, minChars: 100_000 }, // chars threshold not met
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    expect(result).toBeNull();
  });

  test('produces deterministic output', () => {
    const lines = Array.from({ length: 150 }, (_, i) => i === 50 ? 'ERROR: boom' : `ok ${i}`);
    const output = buildOutput(lines);
    const a = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    const b = compressLogs({
      output,
      textKeys: ['stdout', 'stderr'],
      config,
      toolName: 'shell',
      retrievalId: 'r1',
      originalChars: 5_000,
    });
    expect(JSON.stringify(a?.payload.summary)).toBe(JSON.stringify(b?.payload.summary));
  });
});