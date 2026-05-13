import { describe, test, expect, beforeEach } from 'vitest';
import { mockLocalStorage } from '../helpers';
import {
  isValidTokenFormat,
  maskToken,
  normalizeServerUrl,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  getStoredServerUrl,
  setStoredServerUrl,
  hasStoredToken,
} from '@/config/auth';

describe('auth — pure functions', () => {
  describe('isValidTokenFormat', () => {
    test('accepts any non-empty string', () => {
      expect(isValidTokenFormat('my-secret-password-123')).toBe(true);
    });

    test('accepts 64-char hex string', () => {
      expect(isValidTokenFormat('a'.repeat(64))).toBe(true);
    });

    test('rejects empty string', () => {
      expect(isValidTokenFormat('')).toBe(false);
    });

    test('rejects whitespace-only string', () => {
      expect(isValidTokenFormat('   ')).toBe(false);
    });
  });

  describe('maskToken', () => {
    test('masks long token', () => {
      const token = 'a'.repeat(64);
      expect(maskToken(token)).toBe('aaaa...aaaa');
    });

    test('returns short token as-is', () => {
      expect(maskToken('short')).toBe('short');
    });

    test('handles exactly 12-char token', () => {
      expect(maskToken('123456789012')).toBe('1234...9012');
    });

    test('handles 11-char token (too short)', () => {
      expect(maskToken('12345678901')).toBe('12345678901');
    });
  });

  describe('normalizeServerUrl', () => {
    test('strips http:// and trailing slash', () => {
      expect(normalizeServerUrl('http://localhost:3000/')).toBe('localhost:3000');
    });

    test('preserves https:// prefix', () => {
      expect(normalizeServerUrl('https://example.com/')).toBe('https://example.com');
    });

    test('preserves https:// with port', () => {
      expect(normalizeServerUrl('https://domain:8080')).toBe('https://domain:8080');
    });

    test('strips ws:// prefix', () => {
      expect(normalizeServerUrl('ws://localhost:3000')).toBe('localhost:3000');
    });

    test('strips wss:// prefix', () => {
      expect(normalizeServerUrl('wss://example.com')).toBe('example.com');
    });

    test('handles plain host:port', () => {
      expect(normalizeServerUrl('domain:8080/')).toBe('domain:8080');
    });

    test('trims whitespace', () => {
      expect(normalizeServerUrl('  localhost:3000  ')).toBe('localhost:3000');
    });

    test('handles multiple trailing slashes', () => {
      expect(normalizeServerUrl('http://localhost:3000///')).toBe('localhost:3000');
    });
  });
});

describe('auth — localStorage functions', () => {
  const storage = mockLocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  describe('token storage', () => {
    test('getStoredToken returns null when no token', () => {
      expect(getStoredToken()).toBeNull();
    });

    test('setStoredToken and getStoredToken round-trip', () => {
      setStoredToken('test-token-123');
      expect(getStoredToken()).toBe('test-token-123');
    });

    test('clearStoredToken removes token', () => {
      setStoredToken('test-token');
      clearStoredToken();
      expect(getStoredToken()).toBeNull();
    });

    test('hasStoredToken returns false when no token', () => {
      expect(hasStoredToken()).toBe(false);
    });

    test('hasStoredToken returns true when token exists', () => {
      setStoredToken('test-token');
      expect(hasStoredToken()).toBe(true);
    });

    test('expired token is cleared and returns null', () => {
      setStoredToken('expired-token', -1);
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('server URL storage', () => {
    test('getStoredServerUrl returns null when not set', () => {
      expect(getStoredServerUrl()).toBeNull();
    });

    test('setStoredServerUrl and get round-trip', () => {
      setStoredServerUrl('localhost:3000');
      expect(getStoredServerUrl()).toBe('localhost:3000');
    });

    test('clearStoredToken also clears server URL', () => {
      setStoredServerUrl('localhost:3000');
      clearStoredToken();
      expect(getStoredServerUrl()).toBeNull();
    });
  });
});
