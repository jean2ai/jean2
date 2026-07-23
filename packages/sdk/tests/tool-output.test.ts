import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { HttpClient } from '../src/transport/http';
import { SessionsRestNamespace } from '../src/rest/sessions';
import { isToolOutputReference, type ToolOutputReference } from '../src/shared-types/tool-output';

const originalFetch = globalThis.fetch;

function createMockHttp(fetchImpl: (url: string, init: RequestInit) => Promise<Response>): HttpClient {
  globalThis.fetch = mock(fetchImpl) as typeof fetch;
  return new HttpClient({ url: 'https://example.com', token: 'test-token' });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validReference(): ToolOutputReference {
  return {
    type: 'jean2-tool-output',
    version: 1,
    retrievalId: 'j2out_abcdef0123456789abcdef01',
    strategy: 'records',
    toolName: 'grep',
    originalChars: 1000,
    modelChars: 200,
    complete: false,
    message: 'incomplete',
  };
}

describe('isToolOutputReference', () => {
  test('accepts a valid reference', () => {
    expect(isToolOutputReference(validReference())).toBe(true);
  });

  test('rejects null and non-objects', () => {
    expect(isToolOutputReference(null)).toBe(false);
    expect(isToolOutputReference(undefined)).toBe(false);
    expect(isToolOutputReference(123)).toBe(false);
    expect(isToolOutputReference('text')).toBe(false);
    expect(isToolOutputReference(true)).toBe(false);
  });

  test('rejects wrong type', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, type: 'other' })).toBe(false);
  });

  test('rejects wrong version', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, version: 2 })).toBe(false);
    expect(isToolOutputReference({ ...r, version: 0 })).toBe(false);
  });

  test('rejects complete=true (only reduced envelopes may be references)', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, complete: true })).toBe(false);
  });

  test('rejects missing or wrong-typed retrievalId', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, retrievalId: '' })).toBe(false);
    expect(isToolOutputReference({ ...r, retrievalId: 123 })).toBe(false);
    expect(isToolOutputReference({ ...r, retrievalId: undefined })).toBe(false);
    expect(isToolOutputReference({ ...r, retrievalId: 'j2out_not-valid' })).toBe(false);
  });

  test('rejects unknown strategy', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, strategy: 'unknown' as unknown as 'records' })).toBe(false);
  });

  test('accepts every defined strategy', () => {
    for (const strategy of ['records', 'paths', 'logs', 'preview'] as const) {
      expect(isToolOutputReference({ ...validReference(), strategy })).toBe(true);
    }
  });

  test('rejects when toolName is missing', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, toolName: undefined })).toBe(false);
  });

  test('rejects when char counts are missing or non-numeric', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, originalChars: '1000' as unknown as number })).toBe(false);
    expect(isToolOutputReference({ ...r, modelChars: undefined })).toBe(false);
  });

  test('rejects when message is missing', () => {
    const r = validReference();
    expect(isToolOutputReference({ ...r, message: undefined })).toBe(false);
  });
});

describe('SessionsRestNamespace.getToolOutput', () => {
  let capturedUrl: string;
  let capturedInit: RequestInit;

  beforeEach(() => {
    capturedUrl = '';
    capturedInit = {} as RequestInit;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('GET /sessions/:id/tool-outputs/:retrievalId with encoded paths', async () => {
    const http = createMockHttp(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({
        artifact: {
          id: 'j2out_abc',
          sessionId: 'sess/with slashes',
          partId: 'p1',
          callId: 'call 1',
          toolName: 'grep',
          strategy: 'records',
          sourceHash: 'sha256:abc',
          originalChars: 100,
          modelChars: 20,
          createdAt: 0,
          applied: true,
          compressionDurationMs: 1,
          modelRetrievalCount: 0,
          userRetrievalCount: 0,
          lastRetrievedAt: null,
        },
        output: { matches: [] },
      });
    });

    const sessions = new SessionsRestNamespace(http);
    const response = await sessions.getToolOutput('sess/with slashes', 'j2out call 1');
    expect(response.artifact.id).toBe('j2out_abc');
    expect(capturedUrl).toContain('/api/sessions/sess%2Fwith%20slashes/tool-outputs/j2out%20call%201');
    expect(capturedInit.method).toBe('GET');
  });
});