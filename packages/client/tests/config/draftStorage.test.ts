import { describe, test, expect, beforeEach } from 'vitest';
import { mockLocalStorage } from '../helpers';
import { saveDraft, loadDraft, clearDraft, getDraftKey } from '@/config/draftStorage';

describe('draftStorage', () => {
  const storage = mockLocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  describe('getDraftKey', () => {
    test('returns prefixed key', () => {
      expect(getDraftKey('session-1')).toContain('session-1');
    });

    test('different session ids produce different keys', () => {
      expect(getDraftKey('s1')).not.toBe(getDraftKey('s2'));
    });
  });

  describe('saveDraft / loadDraft', () => {
    test('round-trips draft text', () => {
      saveDraft('s1', 'Hello world');
      expect(loadDraft('s1')).toBe('Hello world');
    });

    test('returns empty string when no draft', () => {
      expect(loadDraft('nonexistent')).toBe('');
    });

    test('overwrites existing draft', () => {
      saveDraft('s1', 'first');
      saveDraft('s1', 'second');
      expect(loadDraft('s1')).toBe('second');
    });

    test('handles empty text', () => {
      saveDraft('s1', '');
      // Empty text is still saved
      expect(loadDraft('s1')).toBe('');
    });

    test('handles special characters', () => {
      const special = 'Hello 🌍 "quotes" \'single\' <tag>';
      saveDraft('s1', special);
      expect(loadDraft('s1')).toBe(special);
    });
  });

  describe('clearDraft', () => {
    test('removes draft for session', () => {
      saveDraft('s1', 'text');
      clearDraft('s1');
      expect(loadDraft('s1')).toBe('');
    });

    test('does nothing for nonexistent draft', () => {
      clearDraft('nonexistent');
      // Should not throw
    });
  });

  describe('TTL expiry', () => {
    test('returns empty string for expired draft', () => {
      const key = getDraftKey('s1');
      // TTL is 30 days; use a timestamp well beyond that
      const expiredTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
      storage.setItem(key, JSON.stringify({ text: 'old draft', updatedAt: expiredTimestamp }));
      expect(loadDraft('s1')).toBe('');
    });

    test('removes expired draft from storage', () => {
      const key = getDraftKey('s1');
      const expiredTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
      storage.setItem(key, JSON.stringify({ text: 'old', updatedAt: expiredTimestamp }));
      loadDraft('s1');
      expect(storage.getItem(key)).toBeNull();
    });
  });

  describe('corrupted data', () => {
    test('returns empty string for invalid JSON', () => {
      const key = getDraftKey('s1');
      storage.setItem(key, 'not-json');
      expect(loadDraft('s1')).toBe('');
    });

    test('returns empty string for missing text field', () => {
      const key = getDraftKey('s1');
      storage.setItem(key, JSON.stringify({ updatedAt: Date.now() }));
      expect(loadDraft('s1')).toBe('');
    });
  });
});
