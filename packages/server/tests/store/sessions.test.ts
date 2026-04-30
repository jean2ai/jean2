import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

import { setupTestDatabase, resetTestDatabase } from '#tests/db';
import { createTestSession } from '#tests/factories';
import { seedWorkspace } from '#tests/seed';
import {
  createSession,
  getSession,
  getSessionWithWorkspace,
  updateSession,
  deleteSession,
  listSessions,
  listSessionsByWorkspace,
  listSessionsGrouped,
  getChildSessions,
  deleteSessionsByWorkspace,
} from '@/store/sessions';

function makeSession(overrides: {
  id: string;
  workspaceId: string;
  title: string;
  status: 'active' | 'closed';
  parentId?: string;
  selectedModel?: string | null;
  selectedProvider?: string | null;
  selectedVariant?: string | null;
  preconfigId?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string;
}) {
  const { createdAt: _c, updatedAt: _u, ...defaults } = createTestSession(overrides);
  return defaults;
}

describe('sessions store', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterEach(() => {
    resetTestDatabase();
  });

  describe('createSession', () => {
    test('creates and returns a session', () => {
      seedWorkspace({ id: 'ws1' });
      const session = createSession(makeSession({
        id: 's1',
        workspaceId: 'ws1',
        title: 'Test',
        status: 'active',
      }));

      expect(session.id).toBe('s1');
      expect(session.workspaceId).toBe('ws1');
      expect(session.title).toBe('Test');
      expect(session.status).toBe('active');
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    test('stores optional fields', () => {
      seedWorkspace({ id: 'ws1' });
      const session = createSession(makeSession({
        id: 's2',
        workspaceId: 'ws1',
        title: 'With Options',
        status: 'active',
        selectedModel: 'gpt-4o',
        selectedProvider: 'openai',
        selectedVariant: 'default',
        preconfigId: 'preconfig-1',
        metadata: { key: 'value' },
      }));

      expect(session.selectedModel).toBe('gpt-4o');
      expect(session.selectedProvider).toBe('openai');
      expect(session.selectedVariant).toBe('default');
      expect(session.preconfigId).toBe('preconfig-1');
      expect(session.metadata).toEqual({ key: 'value' });
    });

    test('creates session with parentId for subagents', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({
        id: 'parent',
        workspaceId: 'ws1',
        title: 'Parent',
        status: 'active',
      }));

      const child = createSession(makeSession({
        id: 'child',
        workspaceId: 'ws1',
        title: 'Child',
        status: 'active',
        parentId: 'parent',
      }));

      expect(child.parentId).toBe('parent');
    });
  });

  describe('getSession', () => {
    test('returns session by id', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      const session = getSession('s1');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('s1');
    });

    test('returns null for non-existent session', () => {
      expect(getSession('nonexistent')).toBeNull();
    });
  });

  describe('getSessionWithWorkspace', () => {
    test('returns session with workspace', () => {
      seedWorkspace({ id: 'ws1', name: 'My Workspace', path: '/test' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      const result = getSessionWithWorkspace('s1');
      expect(result).not.toBeNull();
      expect(result!.session.id).toBe('s1');
      expect(result!.workspace).not.toBeNull();
      expect(result!.workspace!.name).toBe('My Workspace');
    });

    test('returns null for non-existent session', () => {
      expect(getSessionWithWorkspace('nonexistent')).toBeNull();
    });
  });

  describe('updateSession', () => {
    test('updates title', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Original', status: 'active' }));

      const updated = updateSession('s1', { title: 'Updated' });
      expect(updated!.title).toBe('Updated');
    });

    test('updates status', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      const updated = updateSession('s1', { status: 'closed' });
      expect(updated!.status).toBe('closed');
    });

    test('updates multiple fields at once', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      const updated = updateSession('s1', {
        title: 'New Title',
        status: 'closed',
        selectedModel: 'claude-3',
        selectedProvider: 'anthropic',
      });

      expect(updated!.title).toBe('New Title');
      expect(updated!.status).toBe('closed');
      expect(updated!.selectedModel).toBe('claude-3');
      expect(updated!.selectedProvider).toBe('anthropic');
    });

    test('updates compacting flag', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      const updated = updateSession('s1', { compacting: true });
      expect(updated!.compacting).toBe(true);
    });

    test('returns null for non-existent session', () => {
      expect(updateSession('nonexistent', { title: 'x' })).toBeNull();
    });

    test('always updates updatedAt', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active', updatedAt: '2020-01-01T00:00:00.000Z' }));

      const updated = updateSession('s1', { title: 'New' });
      expect(updated!.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('deleteSession', () => {
    test('deletes a session and returns true', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'Test', status: 'active' }));

      expect(deleteSession('s1')).toBe(true);
      expect(getSession('s1')).toBeNull();
    });

    test('returns false for non-existent session', () => {
      expect(deleteSession('nonexistent')).toBe(false);
    });
  });

  describe('listSessions', () => {
    test('returns all sessions', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'closed' }));

      const sessions = listSessions();
      expect(sessions).toHaveLength(2);
    });

    test('filters by status', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'closed' }));

      const active = listSessions('active');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('s1');
    });
  });

  describe('listSessionsByWorkspace', () => {
    test('returns sessions for a workspace', () => {
      seedWorkspace({ id: 'ws1' });
      seedWorkspace({ id: 'ws2' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'active' }));
      createSession(makeSession({ id: 's3', workspaceId: 'ws2', title: 'C', status: 'active' }));

      const sessions = listSessionsByWorkspace('ws1');
      expect(sessions).toHaveLength(2);
    });

    test('filters by status', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'closed' }));

      const active = listSessionsByWorkspace('ws1', { status: 'active' });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('s1');
    });

    test('filters rootOnly', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 'parent', workspaceId: 'ws1', title: 'P', status: 'active' }));
      createSession(makeSession({ id: 'child', workspaceId: 'ws1', title: 'C', status: 'active', parentId: 'parent' }));

      const roots = listSessionsByWorkspace('ws1', { rootOnly: true });
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe('parent');
    });

    test('returns empty for workspace with no sessions', () => {
      seedWorkspace({ id: 'ws1' });
      expect(listSessionsByWorkspace('ws1')).toHaveLength(0);
    });
  });

  describe('listSessionsGrouped', () => {
    test('groups sessions by workspace', () => {
      seedWorkspace({ id: 'ws1' });
      seedWorkspace({ id: 'ws2' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws2', title: 'B', status: 'active' }));
      createSession(makeSession({ id: 's3', workspaceId: 'ws2', title: 'C', status: 'active' }));

      const grouped = listSessionsGrouped(['ws1', 'ws2']);
      expect(grouped['ws1']).toHaveLength(1);
      expect(grouped['ws2']).toHaveLength(2);
    });

    test('includes empty arrays for workspace IDs with no sessions', () => {
      seedWorkspace({ id: 'ws1' });
      const grouped = listSessionsGrouped(['ws1']);
      expect(grouped['ws1']).toHaveLength(0);
    });

    test('filters by status', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'closed' }));

      const grouped = listSessionsGrouped(['ws1'], { status: 'active' });
      expect(grouped['ws1']).toHaveLength(1);
    });
  });

  describe('getChildSessions', () => {
    test('returns child sessions', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 'parent', workspaceId: 'ws1', title: 'P', status: 'active' }));
      createSession(makeSession({ id: 'child1', workspaceId: 'ws1', title: 'C1', status: 'active', parentId: 'parent' }));
      createSession(makeSession({ id: 'child2', workspaceId: 'ws1', title: 'C2', status: 'active', parentId: 'parent' }));

      const children = getChildSessions('parent');
      expect(children).toHaveLength(2);
    });

    test('returns empty for session with no children', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 'solo', workspaceId: 'ws1', title: 'Solo', status: 'active' }));

      expect(getChildSessions('solo')).toHaveLength(0);
    });
  });

  describe('deleteSessionsByWorkspace', () => {
    test('deletes all sessions in a workspace', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'active' }));

      deleteSessionsByWorkspace('ws1');
      expect(getSession('s1')).toBeNull();
      expect(getSession('s2')).toBeNull();
    });
  });
});
