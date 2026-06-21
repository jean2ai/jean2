import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { executeSkillManageTool, buildSkillManageToolDescription } from '@/skills/skill-manage-tool';

describe('skill_manage tool', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jean2-skill-manage-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ── Validation ───────────────────────────────────────────────

  describe('input validation', () => {
    test('rejects invalid action', async () => {
      const result = await executeSkillManageTool(
        { action: 'invalid', name: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action');
    });

    test('rejects missing action', async () => {
      const result = await executeSkillManageTool(
        { name: 'test' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
    });

    test('rejects missing name for non-list action', async () => {
      const result = await executeSkillManageTool(
        { action: 'delete' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    test('rejects name with path separators', async () => {
      const result = await executeSkillManageTool(
        { action: 'delete', name: 'a/b' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('path separators');
    });
  });

  // ── list action ──────────────────────────────────────────────

  describe('list action', () => {
    test('returns empty list when no skills exist', async () => {
      const result = await executeSkillManageTool(
        { action: 'list' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('list');
      expect(result.skills).toEqual([]);
    });

    test('returns list of existing skills', async () => {
      // Create a skill manually
      const skillDir = join(testDir, '.agents', 'skills', 'my-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: my-skill\ndescription: A test skill\n---\n\n# Body\n',
      );

      const result = await executeSkillManageTool(
        { action: 'list' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.skills).toHaveLength(1);
      expect(result.skills![0]).toEqual({
        name: 'my-skill',
        description: 'A test skill',
      });
    });

    test('list does not require name parameter', async () => {
      const result = await executeSkillManageTool(
        { action: 'list' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
    });
  });

  // ── create action ────────────────────────────────────────────

  describe('create action', () => {
    test('creates a new skill successfully', async () => {
      const result = await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'A test skill', content: '# Body\n\nSteps here.' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('create');
      expect(result.name).toBe('my-skill');

      // Verify file on disk
      const content = readFileSync(join(testDir, '.agents', 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
      expect(content).toContain('name: my-skill');
      expect(content).toContain('description: A test skill');
      expect(content).toContain('# Body');
    });

    test('rejects create without description', async () => {
      const result = await executeSkillManageTool(
        { action: 'create', name: 'my-skill', content: 'body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('description');
    });

    test('rejects create without content', async () => {
      const result = await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'desc' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    test('rejects create if skill already exists', async () => {
      await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'desc', content: 'body' },
        testDir,
        'none',
      );

      const result = await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'desc', content: 'body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    test('normalizes skill name to safe slug', async () => {
      const result = await executeSkillManageTool(
        { action: 'create', name: 'My Cool Skill!', description: 'desc', content: 'body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.name).toBe('my-cool-skill');
    });
  });

  // ── update action ────────────────────────────────────────────

  describe('update action', () => {
    beforeEach(async () => {
      await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'Original desc', content: 'Original body' },
        testDir,
        'none',
      );
    });

    test('updates skill body', async () => {
      const result = await executeSkillManageTool(
        { action: 'update', name: 'my-skill', content: 'New body content' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('update');

      const content = readFileSync(join(testDir, '.agents', 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
      expect(content).toContain('New body content');
      expect(content).not.toContain('Original body');
    });

    test('preserves existing description when not provided', async () => {
      const result = await executeSkillManageTool(
        { action: 'update', name: 'my-skill', content: 'New body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.description).toBe('Original desc');
    });

    test('updates description when provided', async () => {
      const result = await executeSkillManageTool(
        { action: 'update', name: 'my-skill', description: 'New desc', content: 'New body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.description).toBe('New desc');
    });

    test('rejects update for non-existent skill with available names in error', async () => {
      const result = await executeSkillManageTool(
        { action: 'update', name: 'nope', content: 'body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(result.error).toContain('my-skill');
    });

    test('case-insensitive name resolution', async () => {
      const result = await executeSkillManageTool(
        { action: 'update', name: 'MY-SKILL', content: 'Uppercase body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);

      const content = readFileSync(join(testDir, '.agents', 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Uppercase body');
    });
  });

  // ── patch action ─────────────────────────────────────────────

  describe('patch action', () => {
    beforeEach(async () => {
      await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'A skill', content: 'Line one\nLine two\nLine three' },
        testDir,
        'none',
      );
    });

    test('patches a unique string', async () => {
      const result = await executeSkillManageTool(
        { action: 'patch', name: 'my-skill', oldString: 'Line two', newString: 'Line TWO' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('patch');

      const content = readFileSync(join(testDir, '.agents', 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Line TWO');
      expect(content).not.toContain('Line two');
    });

    test('rejects patch with non-matching oldString with helpful hint', async () => {
      const result = await executeSkillManageTool(
        { action: 'patch', name: 'my-skill', oldString: 'nonexistent text', newString: 'replacement' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('skill'); // hints to load skill first
    });

    test('rejects patch with multiple matches', async () => {
      await executeSkillManageTool(
        { action: 'update', name: 'my-skill', content: 'dup\ndup\n' },
        testDir,
        'none',
      );

      const result = await executeSkillManageTool(
        { action: 'patch', name: 'my-skill', oldString: 'dup', newString: 'unique' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('2 locations');
    });

    test('rejects patch for non-existent skill with available names', async () => {
      const result = await executeSkillManageTool(
        { action: 'patch', name: 'nope', oldString: 'x', newString: 'y' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(result.error).toContain('my-skill');
    });

    test('case-insensitive name resolution for patch', async () => {
      const result = await executeSkillManageTool(
        { action: 'patch', name: 'MY-SKILL', oldString: 'Line two', newString: 'Patched' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
    });
  });

  // ── delete action ────────────────────────────────────────────

  describe('delete action', () => {
    beforeEach(async () => {
      await executeSkillManageTool(
        { action: 'create', name: 'my-skill', description: 'A skill', content: 'body' },
        testDir,
        'none',
      );
    });

    test('deletes an existing skill', async () => {
      const result = await executeSkillManageTool(
        { action: 'delete', name: 'my-skill' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(result.action).toBe('delete');
      expect(existsSync(join(testDir, '.agents', 'skills', 'my-skill'))).toBe(false);
    });

    test('rejects delete for non-existent skill with available names', async () => {
      const result = await executeSkillManageTool(
        { action: 'delete', name: 'nope' },
        testDir,
        'none',
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(result.error).toContain('my-skill');
    });

    test('case-insensitive name resolution for delete', async () => {
      const result = await executeSkillManageTool(
        { action: 'delete', name: 'MY-SKILL' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
    });
  });

  // ── Frontmatter name divergence ──────────────────────────────

  describe('frontmatter name divergence', () => {
    test('resolve by frontmatter name when folder name differs', async () => {
      // Create a skill where the folder name and frontmatter name differ
      const skillDir = join(testDir, '.agents', 'skills', 'custom-folder');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: pretty-name\ndescription: A skill with a custom name\n---\n\nBody here\n',
      );

      // Should resolve by frontmatter name (case-insensitive)
      const result = await executeSkillManageTool(
        { action: 'patch', name: 'PRETTY-NAME', oldString: 'Body here', newString: 'Patched body' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
      expect(content).toContain('Patched body');
    });

    test('delete resolves by frontmatter name', async () => {
      const skillDir = join(testDir, '.agents', 'skills', 'custom-folder');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: pretty-name\ndescription: desc\n---\n\nbody\n',
      );

      const result = await executeSkillManageTool(
        { action: 'delete', name: 'pretty-name' },
        testDir,
        'none',
      );
      expect(result.success).toBe(true);
      expect(existsSync(skillDir)).toBe(false);
    });
  });

  // ── Dynamic description ──────────────────────────────────────

  describe('buildSkillManageToolDescription', () => {
    test('includes skill names when skills exist', async () => {
      const skillDir = join(testDir, '.agents', 'skills', 'debug-flow');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: debug-flow\ndescription: How to debug things\n---\n\nBody\n',
      );

      const desc = await buildSkillManageToolDescription(testDir);
      expect(desc).toContain('debug-flow');
      expect(desc).toContain('How to debug things');
      expect(desc).toContain('list');
    });

    test('shows hint when no skills exist', async () => {
      const desc = await buildSkillManageToolDescription(testDir);
      expect(desc).toContain('No skills exist yet');
    });
  });
});
