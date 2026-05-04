import { describe, test, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '@/stores/connectionStore';

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().resetConnection();
  });

  describe('initial state', () => {
    test('starts disconnected', () => {
      expect(useConnectionStore.getState().connected).toBe(false);
    });

    test('starts with no auth error', () => {
      expect(useConnectionStore.getState().authError).toBeNull();
    });

    test('starts with no timeout', () => {
      expect(useConnectionStore.getState().connectionTimedOut).toBe(false);
    });

    test('starts with zero retry count', () => {
      expect(useConnectionStore.getState().retryCount).toBe(0);
    });

    test('starts with empty streaming sessions', () => {
      expect(useConnectionStore.getState().streamingSessionIds.size).toBe(0);
    });

    test('starts with empty interrupted sessions', () => {
      expect(useConnectionStore.getState().interruptedSessions.size).toBe(0);
    });
  });

  describe('setConnected', () => {
    test('sets connected to true', () => {
      useConnectionStore.getState().setConnected(true);
      expect(useConnectionStore.getState().connected).toBe(true);
    });
  });

  describe('setAuthError', () => {
    test('sets auth error message', () => {
      useConnectionStore.getState().setAuthError('Invalid token');
      expect(useConnectionStore.getState().authError).toBe('Invalid token');
    });

    test('clears auth error with null', () => {
      useConnectionStore.getState().setAuthError('error');
      useConnectionStore.getState().setAuthError(null);
      expect(useConnectionStore.getState().authError).toBeNull();
    });
  });

  describe('setConnectionTimedOut', () => {
    test('sets timed out flag', () => {
      useConnectionStore.getState().setConnectionTimedOut(true);
      expect(useConnectionStore.getState().connectionTimedOut).toBe(true);
    });
  });

  describe('setRetryCount', () => {
    test('sets with direct value', () => {
      useConnectionStore.getState().setRetryCount(3);
      expect(useConnectionStore.getState().retryCount).toBe(3);
    });

    test('sets with updater function', () => {
      useConnectionStore.getState().setRetryCount(2);
      useConnectionStore.getState().setRetryCount((prev) => prev + 1);
      expect(useConnectionStore.getState().retryCount).toBe(3);
    });
  });

  describe('setNextRetryIn', () => {
    test('sets with direct value', () => {
      useConnectionStore.getState().setNextRetryIn(5000);
      expect(useConnectionStore.getState().nextRetryIn).toBe(5000);
    });

    test('sets with updater function', () => {
      useConnectionStore.getState().setNextRetryIn(10);
      useConnectionStore.getState().setNextRetryIn((prev) => prev - 2);
      expect(useConnectionStore.getState().nextRetryIn).toBe(8);
    });
  });

  describe('resetConnection', () => {
    test('resets all state to defaults', () => {
      useConnectionStore.getState().setConnected(true);
      useConnectionStore.getState().setAuthError('err');
      useConnectionStore.getState().setConnectionTimedOut(true);
      useConnectionStore.getState().setRetryCount(5);
      useConnectionStore.getState().addStreamingSession('s1');
      useConnectionStore.getState().addInterruptedSession('s2');

      useConnectionStore.getState().resetConnection();

      const state = useConnectionStore.getState();
      expect(state.connected).toBe(false);
      expect(state.authError).toBeNull();
      expect(state.connectionTimedOut).toBe(false);
      expect(state.retryCount).toBe(0);
      expect(state.nextRetryIn).toBe(0);
      expect(state.streamingSessionIds.size).toBe(0);
      expect(state.interruptedSessions.size).toBe(0);
    });
  });

  describe('streamingSessionIds', () => {
    test('addStreamingSession adds id', () => {
      useConnectionStore.getState().addStreamingSession('s1');
      expect(useConnectionStore.getState().streamingSessionIds.has('s1')).toBe(true);
    });

    test('addStreamingSession ignores duplicate', () => {
      useConnectionStore.getState().addStreamingSession('s1');
      useConnectionStore.getState().addStreamingSession('s1');
      expect(useConnectionStore.getState().streamingSessionIds.size).toBe(1);
    });

    test('removeStreamingSession removes id', () => {
      useConnectionStore.getState().addStreamingSession('s1');
      useConnectionStore.getState().removeStreamingSession('s1');
      expect(useConnectionStore.getState().streamingSessionIds.has('s1')).toBe(false);
    });

    test('removeStreamingSession ignores missing id', () => {
      useConnectionStore.getState().addStreamingSession('s1');
      useConnectionStore.getState().removeStreamingSession('s2');
      expect(useConnectionStore.getState().streamingSessionIds.size).toBe(1);
    });

    test('clearStreamingSessions empties the set', () => {
      useConnectionStore.getState().addStreamingSession('s1');
      useConnectionStore.getState().addStreamingSession('s2');
      useConnectionStore.getState().clearStreamingSessions();
      expect(useConnectionStore.getState().streamingSessionIds.size).toBe(0);
    });

    test('replaceStreamingSessions with array', () => {
      useConnectionStore.getState().replaceStreamingSessions(['s1', 's2']);
      expect(useConnectionStore.getState().streamingSessionIds.has('s1')).toBe(true);
      expect(useConnectionStore.getState().streamingSessionIds.has('s2')).toBe(true);
    });

    test('replaceStreamingSessions with Set', () => {
      useConnectionStore.getState().replaceStreamingSessions(new Set(['s3']));
      expect(useConnectionStore.getState().streamingSessionIds.has('s3')).toBe(true);
      expect(useConnectionStore.getState().streamingSessionIds.size).toBe(1);
    });
  });

  describe('interruptedSessions', () => {
    test('addInterruptedSession adds id', () => {
      useConnectionStore.getState().addInterruptedSession('s1');
      expect(useConnectionStore.getState().interruptedSessions.has('s1')).toBe(true);
    });

    test('addInterruptedSession ignores duplicate', () => {
      useConnectionStore.getState().addInterruptedSession('s1');
      useConnectionStore.getState().addInterruptedSession('s1');
      expect(useConnectionStore.getState().interruptedSessions.size).toBe(1);
    });

    test('removeInterruptedSession removes id', () => {
      useConnectionStore.getState().addInterruptedSession('s1');
      useConnectionStore.getState().removeInterruptedSession('s1');
      expect(useConnectionStore.getState().interruptedSessions.has('s1')).toBe(false);
    });

    test('clearInterruptedSessions empties the set', () => {
      useConnectionStore.getState().addInterruptedSession('s1');
      useConnectionStore.getState().clearInterruptedSessions();
      expect(useConnectionStore.getState().interruptedSessions.size).toBe(0);
    });
  });
});
