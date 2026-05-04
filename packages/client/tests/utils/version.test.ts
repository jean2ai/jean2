import { describe, test, expect } from 'vitest';
import { parseVersion, compareVersions, checkUpdate } from '@/utils/version';

describe('parseVersion', () => {
  test('parses standard semver', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  test('parses semver with v prefix', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  test('parses version with leading/trailing whitespace', () => {
    expect(parseVersion('  2.0.1  ')).toEqual([2, 0, 1]);
  });

  test('parses 0.0.0', () => {
    expect(parseVersion('0.0.0')).toEqual([0, 0, 0]);
  });

  test('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });

  test('returns null for two-part version', () => {
    expect(parseVersion('1.2')).toBeNull();
  });

  test('returns null for four-part version', () => {
    expect(parseVersion('1.2.3.4')).toBeNull();
  });

  test('returns null for prerelease suffix', () => {
    expect(parseVersion('1.2.3-beta')).toBeNull();
  });

  test('returns null for non-numeric parts', () => {
    expect(parseVersion('a.b.c')).toBeNull();
  });

  test('returns null for random text', () => {
    expect(parseVersion('hello')).toBeNull();
  });
});

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  test('returns negative when a < b (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  test('returns positive when a > b (major)', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
  });

  test('returns negative when a < b (minor)', () => {
    expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0);
  });

  test('returns negative when a < b (patch)', () => {
    expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0);
  });

  test('handles v prefix', () => {
    expect(compareVersions('v1.0.0', 'v2.0.0')).toBeLessThan(0);
  });

  test('returns -1 when a is invalid', () => {
    expect(compareVersions('invalid', '1.0.0')).toBe(-1);
  });

  test('returns 1 when b is invalid', () => {
    expect(compareVersions('1.0.0', 'invalid')).toBe(1);
  });

  test('returns 0 when both are invalid', () => {
    expect(compareVersions('invalid', 'also-invalid')).toBe(0);
  });
});

describe('checkUpdate', () => {
  test('returns "up-to-date" when current equals latest', () => {
    expect(checkUpdate('1.0.0', '1.0.0')).toBe('up-to-date');
  });

  test('returns "up-to-date" when current is newer than latest', () => {
    expect(checkUpdate('2.0.0', '1.0.0')).toBe('up-to-date');
  });

  test('returns "update-available" when latest is newer', () => {
    expect(checkUpdate('1.0.0', '2.0.0')).toBe('update-available');
  });

  test('returns "unknown" when latest is null', () => {
    expect(checkUpdate('1.0.0', null)).toBe('unknown');
  });

  test('detects minor update', () => {
    expect(checkUpdate('1.0.0', '1.1.0')).toBe('update-available');
  });

  test('detects patch update', () => {
    expect(checkUpdate('1.0.0', '1.0.1')).toBe('update-available');
  });
});
