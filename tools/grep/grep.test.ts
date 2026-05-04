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

describe('grep tool definition', () => {
  test('has correct name', () => {
    expect(definition.name).toBe('grep');
  });

  test('has required pattern and path', () => {
    const schema = definition.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain('pattern');
    expect(schema.required).toContain('path');
  });
});

// ══════════════════════════════════════════════════════════════════
// Pattern Search
// ══════════════════════════════════════════════════════════════════

describe('grep: pattern search', () => {
  test('finds matching lines in a single file', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'const x = 1;\nconst y = 2;\nconsole.log(x);');

    const result = await execute({ pattern: 'const', path: `${WORKSPACE}/test.ts` }, ctx);
    expect(result.success).toBe(true);
    const matches = (result.result as { matches: Array<{ line: number; content: string }> }).matches;
    expect(matches.length).toBe(2);
    expect(matches[0].line).toBe(1);
    expect(matches[0].content).toContain('const x = 1');
  });

  test('finds matches across files in directory', async () => {
    vfs.writeFile(`${WORKSPACE}/src/a.ts`, 'export const a = 1;');
    vfs.writeFile(`${WORKSPACE}/src/b.ts`, 'export const b = 2;');
    vfs.writeFile(`${WORKSPACE}/src/c.css`, '.class {}');
    vfs.addDir(`${WORKSPACE}/src`);

    const result = await execute({ pattern: 'export', path: `${WORKSPACE}/src` }, ctx);
    expect(result.success).toBe(true);
    const matches = (result.result as { matches: Array<{ file: string }> }).matches;
    expect(matches.length).toBe(2);
  });

  test('supports regex patterns', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'function hello() {}\nconst x = 1;');

    const result = await execute({ pattern: 'function\\s+\\w+', path: `${WORKSPACE}/test.ts` }, ctx);
    expect(result.success).toBe(true);
    const matches = (result.result as { matches: Array<{ content: string }> }).matches;
    expect(matches.length).toBe(1);
    expect(matches[0].content).toContain('function hello');
  });

  test('returns empty matches when pattern not found', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello world');

    const result = await execute({ pattern: 'xyz', path: `${WORKSPACE}/test.ts` }, ctx);
    expect(result.success).toBe(true);
    const matches = (result.result as { matches: unknown[] }).matches;
    expect(matches.length).toBe(0);
  });

  test('invalid regex returns error', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, 'hello');

    const result = await execute({ pattern: '[invalid', path: `${WORKSPACE}/test.ts` }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex');
  });

  test('include filter restricts file types', async () => {
    vfs.writeFile(`${WORKSPACE}/src/a.ts`, 'import foo');
    vfs.writeFile(`${WORKSPACE}/src/b.js`, 'import bar');
    vfs.writeFile(`${WORKSPACE}/src/c.css`, '.import {}');
    vfs.addDir(`${WORKSPACE}/src`);

    const result = await execute({ pattern: 'import', path: `${WORKSPACE}/src`, include: '*.ts' }, ctx);
    expect(result.success).toBe(true);
    const matches = (result.result as { matches: Array<{ file: string }> }).matches;
    expect(matches.length).toBe(1);
    expect(matches[0].file).toContain('a.ts');
  });
});

// ══════════════════════════════════════════════════════════════════
// Permissions
// ══════════════════════════════════════════════════════════════════

describe('grep: permissions', () => {
  test('blocked path returns error', async () => {
    const result = await execute({ pattern: 'test', path: '/etc/config' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('system directories');
  });

  test('outside workspace requires permission', async () => {
    vfs.writeFile('/tmp/external/file.txt', 'hello');
    const _result = await execute({ pattern: 'hello', path: '/tmp/external' }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('outside workspace rejected returns USER_REJECTION', async () => {
    const rejectCtx = createMockContext(vfs, {
      ask: mock(async () => false) as unknown as typeof ctx.ask,
    });
    vfs.writeFile('/tmp/external/file.txt', 'hello');
    const result = await execute({ pattern: 'hello', path: '/tmp/external' }, rejectCtx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_REJECTION');
  });

  test('sensitive path requires permission', async () => {
    vfs.writeFile(`${WORKSPACE}/.env`, 'SECRET=abc');
    const _result = await execute({ pattern: 'SECRET', path: `${WORKSPACE}/.env` }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('workspace file does not require permission', async () => {
    vfs.writeFile(`${WORKSPACE}/normal.txt`, 'hello');
    const result = await execute({ pattern: 'hello', path: `${WORKSPACE}/normal.txt` }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.ask).not.toHaveBeenCalled();
  });
});
