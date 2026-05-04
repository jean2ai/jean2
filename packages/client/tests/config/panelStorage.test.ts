import { describe, test, expect, beforeEach } from 'vitest';
import { mockLocalStorage } from '../helpers';
import {
  getSessionsPanelWidth,
  saveSessionsPanelWidth,
  getFilesPanelWidth,
  saveFilesPanelWidth,
  isValidPanelWidth,
} from '@/config/panelStorage';

describe('panelStorage', () => {
  const storage = mockLocalStorage();
  const DEFAULT_WIDTH = 280;

  beforeEach(() => {
    storage.clear();
  });

  describe('getSessionsPanelWidth', () => {
    test('returns default when not set', () => {
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    });

    test('returns stored width when set', () => {
      saveSessionsPanelWidth(300);
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(300);
    });

    test('clamps width to valid range', () => {
      // Save a very large width — should be clamped
      saveSessionsPanelWidth(99999);
      const result = getSessionsPanelWidth(DEFAULT_WIDTH);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(99999);
    });
  });

  describe('getFilesPanelWidth', () => {
    test('returns default when not set', () => {
      expect(getFilesPanelWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    });

    test('returns stored width when set', () => {
      saveFilesPanelWidth(350);
      expect(getFilesPanelWidth(DEFAULT_WIDTH)).toBe(350);
    });
  });

  describe('saveSessionsPanelWidth', () => {
    test('persists width to localStorage', () => {
      saveSessionsPanelWidth(300);
      // Verify it can be loaded
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(300);
    });
  });

  describe('saveFilesPanelWidth', () => {
    test('persists width to localStorage', () => {
      saveFilesPanelWidth(400);
      expect(getFilesPanelWidth(DEFAULT_WIDTH)).toBe(400);
    });
  });

  describe('isValidPanelWidth', () => {
    test('returns true for valid width', () => {
      expect(isValidPanelWidth(300)).toBe(true);
    });

    test('returns false for zero', () => {
      expect(isValidPanelWidth(0)).toBe(false);
    });

    test('returns false for negative', () => {
      expect(isValidPanelWidth(-1)).toBe(false);
    });

    test('returns false for NaN', () => {
      expect(isValidPanelWidth(NaN)).toBe(false);
    });

    test('returns false for very large width', () => {
      expect(isValidPanelWidth(99999)).toBe(false);
    });
  });

  describe('corrupted storage', () => {
    test('returns default for invalid JSON', () => {
      const key = 'jean2_panel_sessions';
      storage.setItem(key, 'not-json');
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    });

    test('returns default for missing width field', () => {
      const key = 'jean2_panel_sessions';
      storage.setItem(key, JSON.stringify({}));
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    });

    test('returns default for NaN width', () => {
      const key = 'jean2_panel_sessions';
      storage.setItem(key, JSON.stringify({ width: 'not-a-number' }));
      expect(getSessionsPanelWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    });
  });
});
