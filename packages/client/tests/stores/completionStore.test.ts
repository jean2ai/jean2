import { describe, test, expect, beforeEach } from 'vitest';
import {
  useCompletionStore,
  selectCompletionRecord,
  selectIsFlashing,
  selectIsSticky,
  COMPLETION_FLASH_DURATION_MS,
  type CompletionRecord,
} from '@/stores/completionStore';

describe('completionStore', () => {
  beforeEach(() => {
    useCompletionStore.getState().clearAllCompletions();
  });

  test('starts with empty completion state', () => {
    expect(useCompletionStore.getState().completionState.size).toBe(0);
  });

  describe('setCompletion', () => {
    test('sets completion record for a session', () => {
      const record: CompletionRecord = { type: 'flash-only', flashStartedAt: Date.now() };
      useCompletionStore.getState().setCompletion('s1', record);
      expect(useCompletionStore.getState().completionState.get('s1')).toEqual(record);
    });

    test('overwrites existing completion', () => {
      const r1: CompletionRecord = { type: 'flash-only', flashStartedAt: 1000 };
      const r2: CompletionRecord = { type: 'flash-then-sticky', flashStartedAt: 2000 };
      useCompletionStore.getState().setCompletion('s1', r1);
      useCompletionStore.getState().setCompletion('s1', r2);
      expect(useCompletionStore.getState().completionState.get('s1')).toEqual(r2);
    });
  });

  describe('clearCompletion', () => {
    test('removes completion for a session', () => {
      const record: CompletionRecord = { type: 'flash-only', flashStartedAt: Date.now() };
      useCompletionStore.getState().setCompletion('s1', record);
      useCompletionStore.getState().clearCompletion('s1');
      expect(useCompletionStore.getState().completionState.has('s1')).toBe(false);
    });

    test('does nothing if session has no completion', () => {
      useCompletionStore.getState().clearCompletion('nonexistent');
      expect(useCompletionStore.getState().completionState.size).toBe(0);
    });
  });

  describe('clearAllCompletions', () => {
    test('removes all completions', () => {
      useCompletionStore.getState().setCompletion('s1', { type: 'flash-only', flashStartedAt: Date.now() });
      useCompletionStore.getState().setCompletion('s2', { type: 'flash-then-sticky', flashStartedAt: Date.now() });
      useCompletionStore.getState().clearAllCompletions();
      expect(useCompletionStore.getState().completionState.size).toBe(0);
    });
  });

  describe('selectors', () => {
    describe('selectCompletionRecord', () => {
      test('returns record for session', () => {
        const record: CompletionRecord = { type: 'flash-only', flashStartedAt: 1000 };
        useCompletionStore.getState().setCompletion('s1', record);
        const result = selectCompletionRecord('s1')(useCompletionStore.getState());
        expect(result).toEqual(record);
      });

      test('returns undefined for missing session', () => {
        expect(selectCompletionRecord('missing')(useCompletionStore.getState())).toBeUndefined();
      });
    });

    describe('selectIsFlashing', () => {
      test('returns false when no record', () => {
        expect(selectIsFlashing('s1')(useCompletionStore.getState())).toBe(false);
      });

      test('returns true when within flash duration', () => {
        useCompletionStore.getState().setCompletion('s1', {
          type: 'flash-only',
          flashStartedAt: Date.now(),
        });
        expect(selectIsFlashing('s1')(useCompletionStore.getState())).toBe(true);
      });

      test('returns false when flash duration has elapsed', () => {
        useCompletionStore.getState().setCompletion('s1', {
          type: 'flash-only',
          flashStartedAt: Date.now() - COMPLETION_FLASH_DURATION_MS - 100,
        });
        expect(selectIsFlashing('s1')(useCompletionStore.getState())).toBe(false);
      });
    });

    describe('selectIsSticky', () => {
      test('returns false when no record', () => {
        expect(selectIsSticky('s1')(useCompletionStore.getState())).toBe(false);
      });

      test('returns true for flash-then-sticky type', () => {
        useCompletionStore.getState().setCompletion('s1', {
          type: 'flash-then-sticky',
          flashStartedAt: Date.now(),
        });
        expect(selectIsSticky('s1')(useCompletionStore.getState())).toBe(true);
      });

      test('returns false for flash-only type', () => {
        useCompletionStore.getState().setCompletion('s1', {
          type: 'flash-only',
          flashStartedAt: Date.now(),
        });
        expect(selectIsSticky('s1')(useCompletionStore.getState())).toBe(false);
      });
    });
  });
});
