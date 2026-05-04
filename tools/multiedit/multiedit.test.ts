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

describe('multiedit tool definition', () => {
  test('has correct name', () => {
    expect(definition.name).toBe('multiedit');
  });

  test('has required path and edits inputs', () => {
    const schema = definition.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain('path');
    expect(schema.required).toContain('edits');
  });
});

// ══════════════════════════════════════════════════════════════════
// Single Edit
// ══════════════════════════════════════════════════════════════════

describe('multiedit: single edit', () => {
  test('applies a single edit', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const x = 1;\nconst y = 2;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [{ oldString: 'const x = 1;', newString: 'const x = 3;' }],
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('const x = 3;\nconst y = 2;');
  });
});

// ══════════════════════════════════════════════════════════════════
// Multiple Edits (sequential application)
// ══════════════════════════════════════════════════════════════════

describe('multiedit: multiple edits', () => {
  test('applies multiple edits sequentially', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const x = 1;\nconst y = 2;\nconst z = 3;');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'const x = 1;', newString: 'const x = 10;' },
        { oldString: 'const y = 2;', newString: 'const y = 20;' },
      ],
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('const x = 10;\nconst y = 20;\nconst z = 3;');
  });

  test('returns results for each edit', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'aaa\nbbb');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'aaa', newString: 'ccc' },
        { oldString: 'bbb', newString: 'ddd' },
      ],
    }, ctx);
    expect(result.success).toBe(true);
    const res = result.result as { results: Array<{ matchInfo: { strategy: string } }> };
    expect(res.results.length).toBe(2);
  });

  test('edits are applied in order (earlier edits affect later text)', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'old value');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'old', newString: 'new' },
        { oldString: 'new value', newString: 'replaced completely' },
      ],
    }, ctx);
    expect(result.success).toBe(true);
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('replaced completely');
  });
});

// ══════════════════════════════════════════════════════════════════
// Failure Modes
// ══════════════════════════════════════════════════════════════════

describe('multiedit: failure modes', () => {
  test('fails if any edit has no match', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'hello', newString: 'world' },
        { oldString: 'nonexistent', newString: 'xyz' },
      ],
    }, ctx);
    expect(result.success).toBe(false);
    // File should remain unchanged (atomic rollback by not writing)
    // The tool writes the final content, but since it returns early on failure,
    // the file retains the original content
    expect(vfs.readFile(`${WORKSPACE}/test.ts`)).toBe('hello');
  });

  test('fails if any edit has multiple matches', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'foo\nfoo');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'foo', newString: 'bar' },
      ],
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('2 matches');
  });

  test('fails for non-existent file', async () => {
    const result = await execute({
      path: `${WORKSPACE}/nonexistent.ts`,
      edits: [{ oldString: 'a', newString: 'b' }],
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });
});

// ══════════════════════════════════════════════════════════════════
// Permissions
// ══════════════════════════════════════════════════════════════════

describe('multiedit: permissions', () => {
  test('outside workspace requires permission', async () => {
    vfs.writeFile('/tmp/external/file.txt', 'hello');
    const result = await execute({
      path: '/tmp/external/file.txt',
      edits: [{ oldString: 'hello', newString: 'world' }],
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
      edits: [{ oldString: 'hello', newString: 'world' }],
    }, rejectCtx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_REJECTION');
  });

  test('sensitive file requires permission', async () => {
    vfs.writeFile(`${WORKSPACE}/.env`, 'SECRET=abc');
    const result = await execute({
      path: `${WORKSPACE}/.env`,
      edits: [{ oldString: 'SECRET=abc', newString: 'SECRET=xyz' }],
    }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('more than 10 edits requires permission', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'line\n'.repeat(15));
    const edits = Array.from({ length: 11 }, (_, i) => ({
      oldString: `line`,
      newString: `edited`,
    }));
    // This will fail because of multiple matches, but the permission check happens first
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits,
    }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  test('workspace file with ≤10 edits does not require permission', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'aaa\nbbb');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [
        { oldString: 'aaa', newString: 'ccc' },
        { oldString: 'bbb', newString: 'ddd' },
      ],
    }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.ask).not.toHaveBeenCalled();
  });

  test('returns diffs visualization', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'old line');
    const result = await execute({
      path: `${WORKSPACE}/test.ts`,
      edits: [{ oldString: 'old line', newString: 'new line' }],
    }, ctx);
    expect(result.visualization).toBeDefined();
    expect(result.visualization?.type).toBe('diffs');
  });
});
