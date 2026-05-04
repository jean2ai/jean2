import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

import { setupTestDatabase, resetTestDatabase } from '#tests/db';
import { seedWorkspaceWithSession } from '#tests/seed';
import {
  createMessage,
  getMessage,
  updateMessage,
  listMessages,
  deleteMessage,
  deleteMessages,
  createPart,
  getPart,
  updatePart,
  getPartsByMessage,
  getPartsBySession,
  getMessageWithParts,
  listMessagesWithParts,
  createToolPartPending,
  transitionToolToRunning,
  transitionToolToCompleted,
  transitionToolToError,
  transitionToolToRunningByCallId,
  transitionToolToInterrupted,
  findOrphanedToolCalls,
  reconcileOrphanedToolCalls,
  reconcileAllOrphanedToolCalls,
  findOrphanedCompactionTriggers,
  buildEffectiveContextHistory,
} from '@/store/messages';
import { createSession } from '@/store/sessions';
import { createTestSession } from '#tests/factories';
import type { AssistantMessage, Part } from '@jean2/sdk';

function makeSession(overrides: { id: string; workspaceId: string; title: string; status: 'active' | 'closed' }) {
  const { createdAt: _c, updatedAt: _u, ...defaults } = createTestSession(overrides);
  return defaults;
}

describe('messages store', () => {
  let sessionId: string;

  beforeEach(() => {
    const _ctx = setupTestDatabase();
    const result = seedWorkspaceWithSession();
    sessionId = result.sessionId;
  });

  afterEach(() => {
    resetTestDatabase();
  });

  // Helper to create user message
  function createUserMsg(id: string, ts: number = Date.now()) {
    return createMessage({
      id,
      sessionId,
      role: 'user',
      createdAt: ts,
    });
  }

  // Helper to create assistant message
  function createAssistantMsg(id: string, overrides: Partial<AssistantMessage> = {}, ts: number = Date.now()) {
    return createMessage({
      id,
      sessionId,
      role: 'assistant',
      createdAt: ts,
      status: overrides.status ?? 'completed',
      modelId: overrides.modelId ?? 'gpt-4o',
      providerId: overrides.providerId ?? 'openai',
      tokens: overrides.tokens ?? { prompt: 100, completion: 50 },
      cost: overrides.cost ?? 0,
      completedAt: overrides.completedAt ?? ts,
      ...overrides,
    } as AssistantMessage);
  }

  // ===========================================================================
  // Message CRUD
  // ===========================================================================

  describe('message CRUD', () => {
    test('createMessage inserts a user message and returns it', () => {
      const msg = createUserMsg('msg1');

      expect(msg.id).toBe('msg1');
      expect(msg.role).toBe('user');
      expect(msg.sessionId).toBe(sessionId);
    });

    test('createMessage inserts an assistant message with all fields', () => {
      const msg = createAssistantMsg('msg2', {
        status: 'completed',
        modelId: 'gpt-4o',
        providerId: 'openai',
        tokens: { prompt: 200, completion: 100 },
        cost: 0.005,
      });

      expect(msg.id).toBe('msg2');
      expect(msg.role).toBe('assistant');
      if (msg.role === 'assistant') {
        expect(msg.status).toBe('completed');
        expect(msg.modelId).toBe('gpt-4o');
        expect(msg.providerId).toBe('openai');
        expect(msg.tokens).toEqual({ prompt: 200, completion: 100 });
        expect(msg.cost).toBe(0.005);
      }
    });

    test('getMessage returns message by id', () => {
      createUserMsg('msg1');

      const retrieved = getMessage('msg1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('msg1');
      expect(retrieved!.role).toBe('user');
    });

    test('getMessage returns null for non-existent', () => {
      expect(getMessage('nonexistent')).toBeNull();
    });

    test('updateMessage patches assistant message fields', () => {
      createAssistantMsg('msg1', { status: 'streaming' });

      const updated = updateMessage('msg1', {
        status: 'completed',
        cost: 0.01,
      } as Partial<AssistantMessage>);

      expect(updated).not.toBeNull();
      if (updated && updated.role === 'assistant') {
        expect(updated.status).toBe('completed');
        expect(updated.cost).toBe(0.01);
      }
    });

    test('updateMessage returns null for non-existent', () => {
      expect(updateMessage('nonexistent', {})).toBeNull();
    });

    test('listMessages returns messages ordered by created_at', () => {
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);

      const messages = listMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg1');
      expect(messages[1].id).toBe('msg2');
    });

    test('listMessages returns empty for session with no messages', () => {
      expect(listMessages(sessionId)).toHaveLength(0);
    });

    test('deleteMessage removes message and its parts', () => {
      createUserMsg('msg1');
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: Date.now(),
        type: 'text',
        text: 'hello',
      } as Part, sessionId);

      expect(deleteMessage('msg1')).toBe(true);
      expect(getMessage('msg1')).toBeNull();
      expect(getPart('p1')).toBeNull();
    });

    test('deleteMessage returns false for non-existent', () => {
      expect(deleteMessage('nonexistent')).toBe(false);
    });

    test('deleteMessages removes all messages for a session', () => {
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);

      const count = deleteMessages(sessionId);
      expect(count).toBe(2);
      expect(listMessages(sessionId)).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Part CRUD
  // ===========================================================================

  describe('part CRUD', () => {
    test('createPart and getPart roundtrip', () => {
      createUserMsg('msg1');
      const part = createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: Date.now(),
        type: 'text',
        text: 'hello world',
      } as Part, sessionId);

      expect(part.type).toBe('text');

      const retrieved = getPart('p1');
      expect(retrieved).not.toBeNull();
      expect((retrieved as unknown as Record<string, unknown>).text).toBe('hello world');
    });

    test('updatePart merges updates', () => {
      createUserMsg('msg1');
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: Date.now(),
        type: 'text',
        text: 'hello',
      } as Part, sessionId);

      const updated = updatePart('p1', { text: 'hello world' });
      expect(updated).not.toBeNull();
      expect((updated as unknown as Record<string, unknown>).text).toBe('hello world');
    });

    test('updatePart returns null for non-existent', () => {
      expect(updatePart('nonexistent', { text: 'x' })).toBeNull();
    });

    test('getPartsByMessage returns parts in order', () => {
      createUserMsg('msg1');
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: 1000,
        type: 'text',
        text: 'a',
      } as Part, sessionId);
      createPart({
        id: 'p2',
        messageId: 'msg1',
        createdAt: 2000,
        type: 'text',
        text: 'b',
      } as Part, sessionId);

      const parts = getPartsByMessage('msg1');
      expect(parts).toHaveLength(2);
      expect(parts[0].id).toBe('p1');
      expect(parts[1].id).toBe('p2');
    });

    test('getPartsByMessage returns empty for message with no parts', () => {
      createUserMsg('msg1');
      expect(getPartsByMessage('msg1')).toHaveLength(0);
    });

    test('getPartsBySession returns all parts across messages', () => {
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: 1000,
        type: 'text',
        text: 'a',
      } as Part, sessionId);
      createPart({
        id: 'p2',
        messageId: 'msg2',
        createdAt: 2000,
        type: 'text',
        text: 'b',
      } as Part, sessionId);

      const parts = getPartsBySession(sessionId);
      expect(parts).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Combined View
  // ===========================================================================

  describe('combined view', () => {
    test('getMessageWithParts returns message with its parts', () => {
      createUserMsg('msg1');
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: Date.now(),
        type: 'text',
        text: 'hello',
      } as Part, sessionId);

      const result = getMessageWithParts('msg1');
      expect(result).not.toBeNull();
      expect(result!.message.id).toBe('msg1');
      expect(result!.parts).toHaveLength(1);
    });

    test('getMessageWithParts returns null for non-existent', () => {
      expect(getMessageWithParts('nonexistent')).toBeNull();
    });

    test('listMessagesWithParts returns all messages with parts', () => {
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: 1000,
        type: 'text',
        text: 'hello',
      } as Part, sessionId);

      const result = listMessagesWithParts(sessionId);
      expect(result).toHaveLength(2);
      expect(result[0].message.id).toBe('msg1');
      expect(result[0].parts).toHaveLength(1);
      expect(result[1].message.id).toBe('msg2');
      expect(result[1].parts).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Tool State Transitions
  // ===========================================================================

  describe('tool state transitions', () => {
    test('createToolPartPending creates pending tool', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', { path: '/test' }, sessionId);

      expect(tool.type).toBe('tool');
      expect(tool.state.status).toBe('pending');
      expect(tool.name).toBe('read-file');
      expect(tool.callId).toBe('call-1');
      expect(tool.state.input).toEqual({ path: '/test' });
    });

    test('transitionToolToRunning updates status to running', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const running = transitionToolToRunning(tool.id);
      expect(running).not.toBeNull();
      expect(running!.state.status).toBe('running');
      expect(running!.state.input).toEqual({});
      if (running!.state.status === 'running') {
        expect(running!.state.startedAt).toBeDefined();
      }
    });

    test('transitionToolToRunning with childSessionId', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'subagent', {}, sessionId);

      const running = transitionToolToRunning(tool.id, 'child-session-1');
      expect(running!.state.status).toBe('running');
      if (running!.state.status === 'running') {
        expect(running!.state.childSessionId).toBe('child-session-1');
      }
    });

    test('transitionToolToRunning returns null if not pending', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);

      // Already running, can't transition again
      expect(transitionToolToRunning(tool.id)).toBeNull();
    });

    test('transitionToolToCompleted sets output', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);

      const completed = transitionToolToCompleted(tool.id, 'file contents');
      expect(completed).not.toBeNull();
      expect(completed!.state.status).toBe('completed');
      if (completed!.state.status === 'completed') {
        expect(completed!.state.output).toBe('file contents');
        expect(completed!.state.completedAt).toBeDefined();
      }
    });

    test('transitionToolToCompleted returns null if not running', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      // Still pending, can't complete
      expect(transitionToolToCompleted(tool.id, 'output')).toBeNull();
    });

    test('transitionToolToError sets error from any state', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const errored = transitionToolToError(tool.id, 'file not found');
      expect(errored).not.toBeNull();
      expect(errored!.state.status).toBe('error');
      if (errored!.state.status === 'error') {
        expect(errored!.state.error).toBe('file not found');
        expect(errored!.state.failedAt).toBeDefined();
      }
    });

    test('transitionToolToError from running state preserves startedAt', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      const running = transitionToolToRunning(tool.id);
      const startedAt = running!.state.status === 'running' ? running!.state.startedAt : 0;

      const errored = transitionToolToError(tool.id, 'timeout');
      if (errored!.state.status === 'error') {
        expect(errored!.state.startedAt).toBe(startedAt);
      }
    });

    test('cannot transition from completed to running', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);
      transitionToolToCompleted(tool.id, 'done');

      expect(transitionToolToRunning(tool.id)).toBeNull();
    });

    test('cannot transition from completed to completed', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);
      transitionToolToCompleted(tool.id, 'done');

      expect(transitionToolToCompleted(tool.id, 'other')).toBeNull();
    });

    test('transitionToolToRunningByCallId finds tool by call ID', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const running = transitionToolToRunningByCallId(sessionId, 'call-1');
      expect(running).not.toBeNull();
      expect(running!.state.status).toBe('running');
    });

    test('transitionToolToRunningByCallId returns null for unknown call ID', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      expect(transitionToolToRunningByCallId(sessionId, 'unknown')).toBeNull();
    });

    test('transitionToolToRunningByCallId with childSessionId', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      createToolPartPending('msg1', 'call-1', 'subagent', {}, sessionId);

      const running = transitionToolToRunningByCallId(sessionId, 'call-1', 'child-1');
      if (running!.state.status === 'running') {
        expect(running!.state.childSessionId).toBe('child-1');
      }
    });

    test('transitionToolToInterrupted sets interrupted status', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);

      const interrupted = transitionToolToInterrupted(tool.id, 'user_request');
      expect(interrupted).not.toBeNull();
      if (interrupted!.state.status === 'interrupted') {
        expect(interrupted!.state.reason).toBe('user_request');
        expect(interrupted!.state.interruptedAt).toBeDefined();
      }
    });

    test('transitionToolToInterrupted from pending state', () => {
      createAssistantMsg('msg1', { status: 'streaming' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const interrupted = transitionToolToInterrupted(tool.id, 'timeout');
      expect(interrupted).not.toBeNull();
      expect(interrupted!.state.status).toBe('interrupted');
    });
  });

  // ===========================================================================
  // Orphaned Tool Call Recovery
  // ===========================================================================

  describe('orphaned tool call recovery', () => {
    test('findOrphanedToolCalls finds pending tools', () => {
      createAssistantMsg('msg1', { status: 'completed' });
      createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const orphaned = findOrphanedToolCalls(sessionId);
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].name).toBe('read-file');
    });

    test('findOrphanedToolCalls finds running tools', () => {
      createAssistantMsg('msg1', { status: 'completed' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);

      const orphaned = findOrphanedToolCalls(sessionId);
      expect(orphaned).toHaveLength(1);
    });

    test('findOrphanedToolCalls excludes completed tools', () => {
      createAssistantMsg('msg1', { status: 'completed' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToRunning(tool.id);
      transitionToolToCompleted(tool.id, 'done');

      expect(findOrphanedToolCalls(sessionId)).toHaveLength(0);
    });

    test('findOrphanedToolCalls excludes errored tools', () => {
      createAssistantMsg('msg1', { status: 'completed' });
      const tool = createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);
      transitionToolToError(tool.id, 'fail');

      expect(findOrphanedToolCalls(sessionId)).toHaveLength(0);
    });

    test('reconcileOrphanedToolCalls marks them as interrupted', () => {
      createAssistantMsg('msg1', { status: 'completed' });
      createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      const count = reconcileOrphanedToolCalls(sessionId);
      expect(count).toBe(1);
      expect(findOrphanedToolCalls(sessionId)).toHaveLength(0);
    });

    test('reconcileAllOrphanedToolCalls reconciles across sessions', () => {
      // Create two sessions with orphaned tools
      createAssistantMsg('msg1', { status: 'completed' });
      createToolPartPending('msg1', 'call-1', 'read-file', {}, sessionId);

      // Create another session
      createSession(makeSession({ id: 'sess2', workspaceId: 'ws1', title: 'Session 2', status: 'active' }));
      createMessage({ id: 'msg2', sessionId: 'sess2', role: 'assistant', createdAt: Date.now(), status: 'completed', modelId: 'gpt-4o', providerId: 'openai', tokens: { prompt: 0, completion: 0 }, cost: 0 } as AssistantMessage);
      createToolPartPending('msg2', 'call-2', 'shell', { command: 'ls' }, 'sess2');

      const total = reconcileAllOrphanedToolCalls();
      expect(total).toBe(2);
    });
  });

  // ===========================================================================
  // Compaction-Aware Context Building
  // ===========================================================================

  describe('buildEffectiveContextHistory', () => {
    test('returns all messages when no compaction', () => {
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);

      const result = buildEffectiveContextHistory(sessionId);
      expect(result.messages).toHaveLength(2);
      expect(result.hasCompaction).toBe(false);
      expect(result.latestCompactionBoundary).toBeNull();
    });

    test('returns messages from latest compaction boundary', () => {
      // Create: user1, assistant1, TRIGGER(compaction), SUMMARY, user2
      createUserMsg('msg1', 1000);
      createAssistantMsg('msg2', {}, 2000);

      // Trigger: user message with compaction part
      createUserMsg('trigger', 3000);
      createPart({
        id: 'cp1',
        messageId: 'trigger',
        createdAt: 3000,
        type: 'compaction',
        auto: true,
        overflow: false,
      } as Part, sessionId);

      // Summary: assistant message with summary=true, mode='compaction', parentId=trigger
      createAssistantMsg('summary', {
        summary: true,
        mode: 'compaction',
        parentId: 'trigger',
      } as Partial<AssistantMessage>, 4000);
      createPart({
        id: 'sp1',
        messageId: 'summary',
        createdAt: 4000,
        type: 'text',
        text: 'Summary of conversation...',
      } as Part, sessionId);

      // Post-compaction message
      createUserMsg('msg5', 5000);

      const result = buildEffectiveContextHistory(sessionId);
      expect(result.hasCompaction).toBe(true);
      expect(result.messages).toHaveLength(3); // trigger + summary + msg5
      expect(result.messages[0].message.id).toBe('trigger');
      expect(result.messages[1].message.id).toBe('summary');
      expect(result.messages[2].message.id).toBe('msg5');
      expect(result.latestCompactionBoundary).toBe('trigger');
    });

    test('uses latest compaction boundary when multiple exist', () => {
      // First compaction
      createUserMsg('trigger1', 1000);
      createPart({
        id: 'cp1',
        messageId: 'trigger1',
        createdAt: 1000,
        type: 'compaction',
        auto: true,
        overflow: false,
      } as Part, sessionId);
      createAssistantMsg('summary1', {
        summary: true,
        mode: 'compaction',
        parentId: 'trigger1',
      } as Partial<AssistantMessage>, 2000);
      createPart({
        id: 'sp1',
        messageId: 'summary1',
        createdAt: 2000,
        type: 'text',
        text: 'First summary',
      } as Part, sessionId);

      // Some messages
      createUserMsg('msg3', 3000);

      // Second compaction
      createUserMsg('trigger2', 4000);
      createPart({
        id: 'cp2',
        messageId: 'trigger2',
        createdAt: 4000,
        type: 'compaction',
        auto: true,
        overflow: false,
      } as Part, sessionId);
      createAssistantMsg('summary2', {
        summary: true,
        mode: 'compaction',
        parentId: 'trigger2',
      } as Partial<AssistantMessage>, 5000);
      createPart({
        id: 'sp2',
        messageId: 'summary2',
        createdAt: 5000,
        type: 'text',
        text: 'Second summary',
      } as Part, sessionId);

      // Post-second-compaction message
      createUserMsg('msg6', 6000);

      const result = buildEffectiveContextHistory(sessionId);
      expect(result.hasCompaction).toBe(true);
      expect(result.latestCompactionBoundary).toBe('trigger2');
      expect(result.messages).toHaveLength(3); // trigger2 + summary2 + msg6
    });

    test('returns empty for session with no messages', () => {
      const result = buildEffectiveContextHistory(sessionId);
      expect(result.messages).toHaveLength(0);
      expect(result.hasCompaction).toBe(false);
    });
  });

  // ===========================================================================
  // Orphaned Compaction Triggers
  // ===========================================================================

  describe('findOrphanedCompactionTriggers', () => {
    test('finds triggers without outcomes', () => {
      createUserMsg('trigger1', 1000);
      createPart({
        id: 'cp1',
        messageId: 'trigger1',
        createdAt: 1000,
        type: 'compaction',
        auto: true,
        overflow: false,
      } as Part, sessionId);

      const orphaned = findOrphanedCompactionTriggers(sessionId);
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].id).toBe('trigger1');
    });

    test('excludes triggers that have outcomes', () => {
      createUserMsg('trigger1', 1000);
      createPart({
        id: 'cp1',
        messageId: 'trigger1',
        createdAt: 1000,
        type: 'compaction',
        auto: true,
        overflow: false,
      } as Part, sessionId);

      // Create outcome (assistant message with parentId)
      createAssistantMsg('outcome1', {
        parentId: 'trigger1',
      } as Partial<AssistantMessage>, 2000);

      expect(findOrphanedCompactionTriggers(sessionId)).toHaveLength(0);
    });

    test('returns empty when no compaction parts exist', () => {
      createUserMsg('msg1', 1000);
      createPart({
        id: 'p1',
        messageId: 'msg1',
        createdAt: 1000,
        type: 'text',
        text: 'hello',
      } as Part, sessionId);

      expect(findOrphanedCompactionTriggers(sessionId)).toHaveLength(0);
    });
  });
});
