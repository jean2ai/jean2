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

describe('glob tool definition', () => {
  test('has correct name', () => {
    expect(definition.name).toBe('glob');
  });

  test('has required pattern input', () => {
    const schema = definition.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain('pattern');
  });
});

// ══════════════════════════════════════════════════════════════════
// Pattern Matching
// ══════════════════════════════════════════════════════════════════

describe('glob: pattern matching', () => {
  test('finds files with *.ts pattern', async () => {
    vfs.writeFile(`${WORKSPACE}/src/index.ts`, '');
    vfs.writeFile(`${WORKSPACE}/src/app.ts`, '');
    vfs.writeFile(`${WORKSPACE}/src/style.css`, '');
    vfs.addDir(`${WORKSPACE}/src`);

    const result = await execute({ pattern: '**/*.ts' }, ctx);
    expect(result.success).toBe(true);
    const files = (result.result as { files: string[] }).files;
    expect(files.length).toBe(2);
  });

  test('finds files with specific filename pattern', async () => {
    vfs.writeFile(`${WORKSPACE}/package.json`, '{}');
    vfs.writeFile(`${WORKSPACE}/tsconfig.json`, '{}');

    const result = await execute({ pattern: 'package.json' }, ctx);
    expect(result.success).toBe(true);
    const files = (result.result as { files: string[] }).files;
    expect(files).toContain('package.json');
  });

  test('returns empty array when no files match', async () => {
    vfs.writeFile(`${WORKSPACE}/readme.md`, 'hello');

    const result = await execute({ pattern: '*.xyz' }, ctx);
    expect(result.success).toBe(true);
    const files = (result.result as { files: string[] }).files;
    expect(files.length).toBe(0);
  });

  test('non-wildcard pattern checks if exact file exists', async () => {
    vfs.writeFile(`${WORKSPACE}/exact-file.txt`, 'content');

    const result = await execute({ pattern: 'exact-file.txt' }, ctx);
    expect(result.success).toBe(true);
    const files = (result.result as { files: string[] }).files;
    expect(files).toContain('exact-file.txt');
  });

  test('non-wildcard pattern returns empty for non-existent file', async () => {
    const result = await execute({ pattern: 'does-not-exist.txt' }, ctx);
    expect(result.success).toBe(true);
    const files = (result.result as { files: string[] }).files;
    expect(files.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Permissions
// ══════════════════════════════════════════════════════════════════

describe('glob: permissions', () => {
  test('blocked path returns error', async () => {
    const result = await execute({ pattern: '*.ts', path: '/etc/' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('system directories');
  });

  test('outside workspace requires permission', async () => {
    vfs.addDir('/tmp/external');
    const _result = await execute({ pattern: '*.ts', path: '/tmp/external' }, ctx);
    expect(ctx.ask).toHaveBeenCalled();
  });

  test('outside workspace rejected returns USER_REJECTION', async () => {
    const rejectCtx = createMockContext(vfs, {
      ask: mock(async () => false) as unknown as typeof ctx.ask,
    });
    vfs.addDir('/tmp/external');
    const result = await execute({ pattern: '*.ts', path: '/tmp/external' }, rejectCtx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_REJECTION');
  });

  test('workspace does not require permission', async () => {
    vfs.writeFile(`${WORKSPACE}/test.ts`, '');
    const result = await execute({ pattern: '*.ts' }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.ask).not.toHaveBeenCalled();
  });
});
