import { describe, test, expect, beforeEach } from 'vitest';
import { useSessionStore, clearSessionState } from '@/stores/sessionStore';
import type { Session, Message, QueuedMessage } from '@jean2/sdk';

const mockSession: Session = {
  id: 'session-1',
  workspaceId: 'ws-1',
  title: 'Test Session',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Session;

const mockSession2: Session = {
  id: 'session-2',
  workspaceId: 'ws-1',
  title: 'Another Session',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Session;

const mockMessage: Message = {
  id: 'msg-1',
  sessionId: 'session-1',
  role: 'user',
  createdAt: Date.now(),
};

const mockQueuedMessage: QueuedMessage = {
  id: 'queue-1',
  sessionId: 'session-1',
  content: 'queued text',
  position: 0,
  createdAt: Date.now(),
};

describe('sessionStore', () => {
  beforeEach(() => {
    clearSessionState();
  });

  // --- Active Session ---
  describe('currentSession', () => {
    test('starts as null', () => {
      expect(useSessionStore.getState().currentSession).toBeNull();
    });

    test('setCurrentSession sets the session', () => {
      useSessionStore.getState().setCurrentSession(mockSession);
      expect(useSessionStore.getState().currentSession).toEqual(mockSession);
    });

    test('clearActiveSession resets to null', () => {
      useSessionStore.getState().setCurrentSession(mockSession);
      useSessionStore.getState().clearActiveSession();
      expect(useSessionStore.getState().currentSession).toBeNull();
    });
  });

  // --- Session List ---
  describe('sessions', () => {
    test('starts as empty array', () => {
      expect(useSessionStore.getState().sessions).toEqual([]);
    });

    test('setSessions with direct value', () => {
      useSessionStore.getState().setSessions([mockSession, mockSession2]);
      expect(useSessionStore.getState().sessions).toEqual([mockSession, mockSession2]);
    });

    test('setSessions with updater function', () => {
      useSessionStore.getState().setSessions([mockSession]);
      useSessionStore.getState().setSessions((prev) => [...prev, mockSession2]);
      expect(useSessionStore.getState().sessions).toEqual([mockSession, mockSession2]);
    });

    test('addSessionToFront prepends session', () => {
      useSessionStore.getState().setSessions([mockSession]);
      useSessionStore.getState().addSessionToFront(mockSession2);
      expect(useSessionStore.getState().sessions[0]).toEqual(mockSession2);
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    test('updateSession replaces matching session by id', () => {
      useSessionStore.getState().setSessions([mockSession, mockSession2]);
      const updated = { ...mockSession, title: 'Updated Title' };
      useSessionStore.getState().updateSession(updated);
      expect(useSessionStore.getState().sessions[0].title).toBe('Updated Title');
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    test('updateSession does nothing if id not found', () => {
      useSessionStore.getState().setSessions([mockSession]);
      const unknown = { ...mockSession2, id: 'nonexistent' } as Session;
      useSessionStore.getState().updateSession(unknown);
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    test('removeSessionById removes the session', () => {
      useSessionStore.getState().setSessions([mockSession, mockSession2]);
      useSessionStore.getState().removeSessionById('session-1');
      expect(useSessionStore.getState().sessions).toEqual([mockSession2]);
    });

    test('removeSessionById with unknown id does nothing', () => {
      useSessionStore.getState().setSessions([mockSession]);
      useSessionStore.getState().removeSessionById('nonexistent');
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    test('clearSessions empties the array', () => {
      useSessionStore.getState().setSessions([mockSession]);
      useSessionStore.getState().clearSessions();
      expect(useSessionStore.getState().sessions).toEqual([]);
    });
  });

  // --- Chat Session ---
  describe('chat session state', () => {
    test('has default model', () => {
      expect(useSessionStore.getState().currentModel).toBe('gpt-4o');
    });

    test('setCurrentModel updates model', () => {
      useSessionStore.getState().setCurrentModel('claude-3');
      expect(useSessionStore.getState().currentModel).toBe('claude-3');
    });

    test('setSelectedVariant updates variant', () => {
      useSessionStore.getState().setSelectedVariant('variant-a');
      expect(useSessionStore.getState().selectedVariant).toBe('variant-a');
    });

    test('setSessionUsage updates usage', () => {
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      useSessionStore.getState().setSessionUsage(usage);
      expect(useSessionStore.getState().sessionUsage).toEqual(usage);
    });

    test('setCompactionSuccess updates flag', () => {
      useSessionStore.getState().setCompactionSuccess(true);
      expect(useSessionStore.getState().compactionSuccess).toBe(true);
    });

    test('clearChatSession resets to defaults', () => {
      useSessionStore.getState().setCurrentModel('claude-3');
      useSessionStore.getState().setSelectedVariant('v');
      useSessionStore.getState().setCompactionSuccess(true);
      useSessionStore.getState().clearChatSession();
      expect(useSessionStore.getState().currentModel).toBe('gpt-4o');
      expect(useSessionStore.getState().selectedVariant).toBeNull();
      expect(useSessionStore.getState().compactionSuccess).toBe(false);
    });
  });

  // --- Session Content ---
  describe('messagesBySession / partsBySession', () => {
    test('setMessagesBySession with direct value', () => {
      useSessionStore.getState().setMessagesBySession({ 'session-1': [mockMessage] });
      expect(useSessionStore.getState().messagesBySession['session-1']).toEqual([mockMessage]);
    });

    test('setMessagesBySession with updater function', () => {
      useSessionStore.getState().setMessagesBySession({});
      useSessionStore.getState().setMessagesBySession((prev) => ({
        ...prev,
        'session-1': [mockMessage],
      }));
      expect(useSessionStore.getState().messagesBySession['session-1']).toEqual([mockMessage]);
    });

    test('getMessagesBySessionKeysCount returns correct count', () => {
      useSessionStore.getState().setMessagesBySession({
        's1': [mockMessage],
        's2': [mockMessage],
      });
      expect(useSessionStore.getState().getMessagesBySessionKeysCount()).toBe(2);
    });

    test('setPartsBySession with direct value', () => {
      useSessionStore.getState().setPartsBySession({ 'session-1': { 'msg-1': [] } });
      expect(useSessionStore.getState().partsBySession['session-1']).toEqual({ 'msg-1': [] });
    });
  });

  // --- Message Queue ---
  describe('queuedMessages', () => {
    test('starts empty', () => {
      expect(useSessionStore.getState().queuedMessages).toEqual({});
    });

    test('setQueuedMessagesForSession sets messages', () => {
      useSessionStore.getState().setQueuedMessagesForSession('s1', [mockQueuedMessage]);
      expect(useSessionStore.getState().queuedMessages['s1']).toEqual([mockQueuedMessage]);
    });

    test('addQueuedMessage appends to session queue', () => {
      useSessionStore.getState().addQueuedMessage('s1', mockQueuedMessage);
      expect(useSessionStore.getState().queuedMessages['s1']).toHaveLength(1);
    });

    test('addQueuedMessage creates array if session has no queue', () => {
      useSessionStore.getState().addQueuedMessage('s2', mockQueuedMessage);
      expect(useSessionStore.getState().queuedMessages['s2']).toEqual([mockQueuedMessage]);
    });

    test('removeQueuedMessageById removes specific message', () => {
      const q1 = { ...mockQueuedMessage, id: 'q1' } as QueuedMessage;
      const q2 = { ...mockQueuedMessage, id: 'q2' } as QueuedMessage;
      useSessionStore.getState().setQueuedMessagesForSession('s1', [q1, q2]);
      useSessionStore.getState().removeQueuedMessageById('s1', 'q1');
      expect(useSessionStore.getState().queuedMessages['s1']).toEqual([q2]);
    });

    test('removeQueuedMessagesByIds removes multiple messages', () => {
      const q1 = { ...mockQueuedMessage, id: 'q1' } as QueuedMessage;
      const q2 = { ...mockQueuedMessage, id: 'q2' } as QueuedMessage;
      const q3 = { ...mockQueuedMessage, id: 'q3' } as QueuedMessage;
      useSessionStore.getState().setQueuedMessagesForSession('s1', [q1, q2, q3]);
      useSessionStore.getState().removeQueuedMessagesByIds('s1', ['q1', 'q3']);
      expect(useSessionStore.getState().queuedMessages['s1']).toEqual([q2]);
    });

    test('clearQueuedMessages empties all queues', () => {
      useSessionStore.getState().addQueuedMessage('s1', mockQueuedMessage);
      useSessionStore.getState().clearQueuedMessages();
      expect(useSessionStore.getState().queuedMessages).toEqual({});
    });
  });
});
