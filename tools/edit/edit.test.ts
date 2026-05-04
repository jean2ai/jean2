import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { definition, execute } from './tool';
import { createMockContext, VirtualFS, WORKSPACE } from '../test-utils';

let vfs: VirtualFS;
let ctx: ReturnType<typeof createMockContext>;

beforeEach(() => {
  vfs = new VirtualFS();
  ctx = createMockContext(vfs);
});

// ══════════════════════════════════════════════════════════════════
// Tool Definition
// ══════════════════════════════════════════════════════════════════

describe('edit tool definition', () => {
  test('has correct name', () => {
    expect(definition.name).toBe('edit');
  });

  test('has required path, oldString, newString', () => {
    const schema = definition.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain('path');
    expect(schema.required).toContain('oldString');
    expect(schema.required).toContain('newString');
  });

  test('has optional strategy parameter', () => {
    const schema = definition.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties.strategy).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// Exact Match Strategy
// ══════════════════════════════════════════════════════════════════

describe('edit: exact match', () => {
  test('replaces exact match', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const x = 1;\nconst y = 2;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'const x = 1;',
      newString: 'const x = 3;',
      strategy: 'exact',
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('const x = 3;\nconst y = 2;');
  });

  test('returns match info', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello world');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'hello',
      newString: 'hi',
      strategy: 'exact',
    }, ctx);
    expect(result.success).toBe(true);
    const matchInfo = (result.result as { matchInfo: { strategy: string; lineNumber: number } }).matchInfo;
    expect(matchInfo.strategy).toBe('exact');
    expect(matchInfo.lineNumber).toBe(1);
  });

  test('fails when no exact match found', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello world');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'not found',
      newString: 'replacement',
      strategy: 'exact',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('no match');
  });

  test('fails with multiple matches', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'foo\nfoo');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'foo',
      newString: 'bar',
      strategy: 'exact',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('2 matches');
  });
});

// ══════════════════════════════════════════════════════════════════
// Line Start Strategy
// ══════════════════════════════════════════════════════════════════

describe('edit: line_start match', () => {
  test('matches at line start (unique match)', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, '  const x = 1;\n  let y = 2;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: '  const',
      newString: '    const',
      strategy: 'line_start',
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('    const x = 1;\n  let y = 2;');
  });

  test('fails when line_start not found', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'xyz',
      newString: 'abc',
      strategy: 'line_start',
    }, ctx);
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Line End Strategy
// ══════════════════════════════════════════════════════════════════

describe('edit: line_end match', () => {
  test('matches at line end', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const x = 1;  \nconst y = 2;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: '1;  ',
      newString: '1;',
      strategy: 'line_end',
    }, ctx);
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Partial Match Strategy (whitespace-insensitive)
// ══════════════════════════════════════════════════════════════════

describe('edit: partial match', () => {
  test('matches ignoring whitespace differences', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const   x   =   1;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'const x = 1;',
      newString: 'const x = 2;',
      strategy: 'partial',
    }, ctx);
    expect(result.success).toBe(true);
  });

  test('fails when partial match not found', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'xyz',
      newString: 'abc',
      strategy: 'partial',
    }, ctx);
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Multi-line Match Strategy
// ══════════════════════════════════════════════════════════════════

describe('edit: multi_line match', () => {
  test('matches multi-line pattern', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'function foo() {\n  return 1;\n}');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'function foo() {\n  return 1;\n}',
      newString: 'function bar() {\n  return 2;\n}',
      strategy: 'multi_line',
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('function bar() {\n  return 2;\n}');
  });
});

// ══════════════════════════════════════════════════════════════════
// Auto-Strategy (no explicit strategy)
// ══════════════════════════════════════════════════════════════════

describe('edit: auto-strategy fallback', () => {
  test('tries strategies in order until one matches', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello world');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'hello',
      newString: 'hi',
    }, ctx);
    expect(result.success).toBe(true);
    const matchInfo = (result.result as { matchInfo: { strategy: string } }).matchInfo;
    expect(matchInfo.strategy).toBe('exact');
  });

  test('falls back to partial when exact fails', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const   x = 1;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'const x = 1;',
      newString: 'const x = 2;',
    }, ctx);
    expect(result.success).toBe(true);
    const matchInfo = (result.result as { matchInfo: { strategy: string } }).matchInfo;
    expect(matchInfo.strategy).toBe('partial');
  });

  test('fails when no strategy finds a match', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello world');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'xyz',
      newString: 'abc',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No match found');
  });
});

// ══════════════════════════════════════════════════════════════════
// Error Handling
// ══════════════════════════════════════════════════════════════════

describe('edit: error handling', () => {
  test('returns error for non-existent file', async () => {
    const result = await execute({
      path: `${WORKSPACE}/nonexistent.ts`,
      oldString: 'a',
      newString: 'b',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  test('returns error for blocked path', async () => {
    vfs.writeFile('/etc/config', 'data');
    const result = await execute({
      path: '/etc/config',
      oldString: 'a',
      newString: 'b',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('system directories');
  });

  test('returns diff visualization', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'old line');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      oldString: 'old line',
      newString: 'new line',
    }, ctx);
    expect(result.visualization).toBeDefined();
    expect(result.visualization?.type).toBe('diff');
  });
});

// ══════════════════════════════════════════════════════════════════
// Permissions
// ══════════════════════════════════════════════════════════════════

describe('edit: permissions', () => {
  test('outside workspace requires permission', async () => {
    vfs.writeFile('/tmp/external/file.txt', 'hello');
    const _result = await execute({
      path: '/tmp/external/file.txt',
      oldString: 'hello',
      newString: 'world',
    }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('outside workspace rejected returns USER_REJECTION', async () => {
    const rejectCtx = createMockContext(vfs, {
      ask: mock(async () => false) as unknown as typeof ctx.ask,
    });
    vfs.writeFile('/tmp/external/file.txt', 'hello');
    const result = await execute({
      path: '/tmp/external/file.txt',
      oldString: 'hello',
      newString: 'world',
    }, rejectCtx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_REJECTION');
    // Original content unchanged
    expect(vfs.readFile('/tmp/external/file.txt')).toBe('hello');
  });

  test('sensitive file requires permission', async () => {
    vfs.writeFile(`${WORKSPACE}/.env`, 'SECRET=abc');
    const _result = await execute({
      path: `${WORKSPACE}/.env`,
      oldString: 'SECRET=abc',
      newString: 'SECRET=xyz',
    }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('workspace file does not require permission', async () => {
    vfs.writeFile(`${WORKSPACE}/normal.txt`, 'hello');
    const result = await execute({
      path: `${WORKSPACE}/normal.txt`,
      oldString: 'hello',
      newString: 'world',
    }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.ask).not.toHaveBeenCalled();
  });
});
