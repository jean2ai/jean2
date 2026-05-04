import { describe, test, expect } from 'vitest';
import { getProtocol, getWsProtocol, buildApiUrl, buildWsUrl } from '@/config/urls';

describe('getProtocol', () => {
  test('returns https for https URL', () => {
    expect(getProtocol('https://example.com')).toBe('https');
  });

  test('returns http for http URL', () => {
    expect(getProtocol('http://localhost:3000')).toBe('http');
  });

  test('returns http for URL without protocol', () => {
    expect(getProtocol('localhost:3000')).toBe('http');
  });

  test('returns http for empty string', () => {
    expect(getProtocol('')).toBe('http');
  });
});

describe('getWsProtocol', () => {
  test('returns wss for https URL', () => {
    expect(getWsProtocol('https://example.com')).toBe('wss');
  });

  test('returns ws for http URL', () => {
    expect(getWsProtocol('http://localhost:3000')).toBe('ws');
  });

  test('returns ws for URL without protocol', () => {
    expect(getWsProtocol('localhost:3000')).toBe('ws');
  });
});

describe('buildApiUrl', () => {
  test('builds HTTP URL from plain host', () => {
    expect(buildApiUrl('localhost:3000', '/api/test')).toBe('http://localhost:3000/api/test');
  });

  test('builds HTTP URL from http://host', () => {
    expect(buildApiUrl('http://localhost:3000', '/api/test')).toBe('http://localhost:3000/api/test');
  });

  test('builds HTTPS URL from https://host', () => {
    expect(buildApiUrl('https://example.com', '/api/test')).toBe('https://example.com/api/test');
  });

  test('preserves port numbers', () => {
    expect(buildApiUrl('example.com:8080', '/api/data')).toBe('http://example.com:8080/api/data');
  });
});

describe('buildWsUrl', () => {
  test('builds WS URL from plain host', () => {
    expect(buildWsUrl('localhost:3000', '/ws')).toBe('ws://localhost:3000/ws');
  });

  test('builds WSS URL from https host', () => {
    expect(buildWsUrl('https://example.com', '/ws')).toBe('wss://example.com/ws');
  });

  test('builds WS URL from http host', () => {
    expect(buildWsUrl('http://localhost:3000', '/ws')).toBe('ws://localhost:3000/ws');
  });
});
