import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { executeMemoryTool } from '@/memory/memory-tool';

describe('memory tool', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jean2-memory-tool-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ── Validation ───────────────────────────────────────────────

  describe('input validation', () => {
    test('rejects invalid action', async () => {
      const result = await executeMemoryTool(
        { action: 'invalid', target: 'user', content: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action');
    });

    test('rejects invalid target', async () => {
      const result = await executeMemoryTool(
        { action: 'add', target: 'invalid', content: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid target');
    });

    test('rejects missing action', async () => {
      const result = await executeMemoryTool(
        { target: 'user', content: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
    });

    test('rejects missing target', async () => {
      const result = await executeMemoryTool(
        { action: 'add', content: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
    });
  });

  // ── Add action ───────────────────────────────────────────────

  describe('add', () => {
    test('adds entry successfully', async () => {
      const result = await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Test fact' },
        testDir,
        'none',
      );

      expect(result.success).toBe(true);
      expect(result.result!.action).toBe('add');
      expect(result.result!.entry).toBe('Test fact');
    });

    test('rejects add without content', async () => {
      const result = await executeMemoryTool(
        { action: 'add', target: 'memory' },
        testDir,
        'none',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  // ── Replace action ───────────────────────────────────────────

  describe('replace', () => {
    test('replaces entry successfully', async () => {
      await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Old fact' },
        testDir,
        'none',
      );

      const result = await executeMemoryTool(
        { action: 'replace', target: 'memory', oldText: 'Old fact', content: 'New fact' },
        testDir,
        'none',
      );

      expect(result.success).toBe(true);
      expect(result.result!.action).toBe('replace');
      expect(result.result!.entry).toBe('New fact');
    });

    test('rejects replace without oldText', async () => {
      const result = await executeMemoryTool(
        { action: 'replace', target: 'memory', content: 'New' },
        testDir,
        'none',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('oldText');
    });

    test('rejects replace without content', async () => {
      await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Fact' },
        testDir,
        'none',
      );

      const result = await executeMemoryTool(
        { action: 'replace', target: 'memory', oldText: 'Fact' },
        testDir,
        'none',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  // ── Remove action ────────────────────────────────────────────

  describe('remove', () => {
    test('removes entry successfully', async () => {
      await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'To remove' },
        testDir,
        'none',
      );

      const result = await executeMemoryTool(
        { action: 'remove', target: 'memory', oldText: 'To remove' },
        testDir,
        'none',
      );

      expect(result.success).toBe(true);
      expect(result.result!.action).toBe('remove');
    });

    test('rejects remove without oldText', async () => {
      const result = await executeMemoryTool(
        { action: 'remove', target: 'memory' },
        testDir,
        'none',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('oldText');
    });
  });

  // ── Permission flow ──────────────────────────────────────────

  describe('permissions', () => {
    test('skips permission ask when risk is none', async () => {
      let askCalled = false;
      const askFn = async () => { askCalled = true; return true; };

      const result = await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Fact' },
        testDir,
        'none',
        askFn as any,
      );

      expect(result.success).toBe(true);
      expect(askCalled).toBe(false);
    });

    test('calls askFn when risk is set', async () => {
      let askCalled = false;
      const askFn = async () => { askCalled = true; return true; };

      const result = await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Fact' },
        testDir,
        'medium',
        askFn as any,
      );

      expect(result.success).toBe(true);
      expect(askCalled).toBe(true);
    });

    test('rejects when askFn returns false', async () => {
      const askFn = async () => false;

      const result = await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Fact' },
        testDir,
        'high',
        askFn as any,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('USER_REJECTION');
    });

    test('passes correct permission ask structure', async () => {
      let capturedAsk: any = null;
      const askFn = async (ask: any) => { capturedAsk = ask; return true; };

      await executeMemoryTool(
        { action: 'add', target: 'user', content: 'Pref' },
        testDir,
        'medium',
        askFn as any,
      );

      expect(capturedAsk).not.toBeNull();
      expect(capturedAsk.type).toBe('permission');
      expect(capturedAsk.risk).toBe('medium');
      expect(capturedAsk.resource).toBe('file');
      expect(capturedAsk.action).toBe('write');
    });
  });

  // ── File operations ──────────────────────────────────────────

  describe('file operations', () => {
    test('creates .jean2 directory if missing', async () => {
      const result = await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Fact' },
        testDir,
        'none',
      );

      expect(result.success).toBe(true);
      const dir = join(testDir, '.jean2');
      const { existsSync } = await import('fs');
      expect(existsSync(dir)).toBe(true);
    });

    test('writes to user file for user target', async () => {
      await executeMemoryTool(
        { action: 'add', target: 'user', content: 'User pref' },
        testDir,
        'none',
      );

      const content = readFileSync(join(testDir, '.jean2', 'USER.md'), 'utf-8');
      expect(content).toBe('- User pref');
    });

    test('writes to memory file for memory target', async () => {
      await executeMemoryTool(
        { action: 'add', target: 'memory', content: 'Workspace fact' },
        testDir,
        'none',
      );

      const content = readFileSync(join(testDir, '.jean2', 'MEMORY.md'), 'utf-8');
      expect(content).toBe('- Workspace fact');
    });
  });
});
