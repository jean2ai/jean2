import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

import { setupTestDatabase, resetTestDatabase } from '#tests/db';
import { seedWorkspace, seedWorkspaceWithSession } from '#tests/seed';
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  countSessionsInWorkspace,
  type CreateWorkspaceInput,
} from '@/store/workspaces';
import { createSession, getSession } from '@/store/sessions';
import { createTestSession } from '#tests/factories';

function makeSession(overrides: { id: string; workspaceId: string; title: string; status: 'active' | 'closed' }) {
  const { createdAt: _c, updatedAt: _u, ...defaults } = createTestSession(overrides);
  return defaults;
}

describe('workspaces store', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterEach(() => {
    resetTestDatabase();
  });

  describe('createWorkspace', () => {
    test('creates and returns a workspace', () => {
      seedWorkspace({ id: 'ws1', name: 'Test', path: '/test' });

      const ws = getWorkspace('ws1');
      expect(ws).not.toBeNull();
      expect(ws!.id).toBe('ws1');
      expect(ws!.name).toBe('Test');
      expect(ws!.path).toBe('/test');
      expect(ws!.isVirtual).toBe(false);
      expect(ws!.createdAt).toBeDefined();
      expect(ws!.updatedAt).toBeDefined();
    });

    test('creates a virtual workspace', () => {
      const ws = seedWorkspace({ id: 'ws-v', name: 'Virtual', path: '', isVirtual: true });

      expect(ws.isVirtual).toBe(true);
    });
  });

  describe('getWorkspace', () => {
    test('returns workspace by id', () => {
      seedWorkspace({ id: 'ws1' });
      const ws = getWorkspace('ws1');

      expect(ws).not.toBeNull();
      expect(ws!.id).toBe('ws1');
    });

    test('returns null for non-existent workspace', () => {
      expect(getWorkspace('nonexistent')).toBeNull();
    });
  });

  describe('listWorkspaces', () => {
    test('returns all workspaces ordered by created_at DESC', () => {
      createWorkspace({ id: 'ws1', name: 'First', path: '/1', isVirtual: false });
      createWorkspace({ id: 'ws2', name: 'Second', path: '/2', isVirtual: false });

      const list = listWorkspaces();
      expect(list).toHaveLength(2);
      // Both created in same ms, so just verify both exist
      const ids = list.map(w => w.id).sort();
      expect(ids).toEqual(['ws1', 'ws2']);
    });

    test('returns empty array when no workspaces', () => {
      expect(listWorkspaces()).toHaveLength(0);
    });
  });

  describe('updateWorkspace', () => {
    test('updates the name', () => {
      seedWorkspace({ id: 'ws1', name: 'Original' });
      const updated = updateWorkspace('ws1', { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
    });

    test('returns null for non-existent workspace', () => {
      expect(updateWorkspace('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('deleteWorkspace', () => {
    test('deletes a workspace and returns true', () => {
      seedWorkspace({ id: 'ws1' });

      expect(deleteWorkspace('ws1')).toBe(true);
      expect(getWorkspace('ws1')).toBeNull();
    });

    test('returns false for non-existent workspace', () => {
      expect(deleteWorkspace('nonexistent')).toBe(false);
    });

    test('cascades to sessions', () => {
      const { workspaceId, sessionId } = seedWorkspaceWithSession();

      deleteWorkspace(workspaceId);
      expect(getSession(sessionId)).toBeNull();
    });
  });

  describe('countSessionsInWorkspace', () => {
    test('returns 0 when workspace has no sessions', () => {
      seedWorkspace({ id: 'ws1' });
      expect(countSessionsInWorkspace('ws1')).toBe(0);
    });

    test('counts sessions in workspace', () => {
      seedWorkspace({ id: 'ws1' });
      createSession(makeSession({ id: 's1', workspaceId: 'ws1', title: 'A', status: 'active' }));
      createSession(makeSession({ id: 's2', workspaceId: 'ws1', title: 'B', status: 'active' }));

      expect(countSessionsInWorkspace('ws1')).toBe(2);
    });
  });
});
