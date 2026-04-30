# 01 — Pure Utility Tests

**Start here after foundation is set up.** These are the easiest tests to write — pure functions, no database, no mocking. They build momentum and catch real bugs.

## Modules to Test

### 1. `utils/strip-visualization.ts` (51 lines)

**Why first:** Pure recursive function. Zero dependencies. Takes ~5 minutes to test fully.

```typescript
// src/utils/strip-visualization.test.ts
import { describe, test, expect } from 'bun:test';
import { stripVisualization, extractVisualization } from './strip-visualization';

describe('stripVisualization', () => {
  test('returns null/undefined unchanged', () => {
    expect(stripVisualization(null)).toBe(null);
    expect(stripVisualization(undefined)).toBe(undefined);
  });

  test('returns primitives unchanged', () => {
    expect(stripVisualization('hello')).toBe('hello');
    expect(stripVisualization(42)).toBe(42);
    expect(stripVisualization(true)).toBe(true);
  });

  test('strips _visualization from flat object', () => {
    const input = {
      content: 'file contents',
      _visualization: { type: 'code', language: 'ts' },
    };
    const result = stripVisualization(input);
    expect(result).toEqual({ content: 'file contents' });
    expect('_visualization' in (result as object)).toBe(false);
  });

  test('strips _visualization from nested objects', () => {
    const input = {
      tools: [
        { name: 'read', _visualization: { type: 'list' } },
        { name: 'write', _visualization: { type: 'list' } },
      ],
    };
    const result = stripVisualization(input);
    expect(result).toEqual({
      tools: [{ name: 'read' }, { name: 'write' }],
    });
  });

  test('strips _visualization from arrays', () => {
    const input = [
      { _visualization: { type: 'diff' }, content: 'a' },
      { _visualization: { type: 'diff' }, content: 'b' },
    ];
    const result = stripVisualization(input);
    expect(result).toEqual([{ content: 'a' }, { content: 'b' }]);
  });

  test('preserves all other fields', () => {
    const input = { success: true, result: { files: ['a.ts'] }, _visualization: {} };
    const result = stripVisualization(input);
    expect(result).toEqual({ success: true, result: { files: ['a.ts'] } });
  });
});

describe('extractVisualization', () => {
  test('extracts _visualization from object', () => {
    const viz = { type: 'code', language: 'ts' };
    const input = { content: 'hello', _visualization: viz };
    expect(extractVisualization(input)).toEqual(viz);
  });

  test('returns undefined when no _visualization', () => {
    expect(extractVisualization({ content: 'hello' })).toBeUndefined();
    expect(extractVisualization(null)).toBeUndefined();
    expect(extractVisualization('string')).toBeUndefined();
  });
});
```

---

### 2. `utils/errors.ts` (199 lines)

**Why:** Pure classification logic. Error handling is critical — misclassifying a rate-limit error as non-retryable means lost retries.

The key function is `classifyApiError()`. It takes `unknown` and returns a `ClassifiedError` with type, retryability, and retry delay.

```typescript
// src/utils/errors.test.ts
import { describe, test, expect } from 'bun:test';
import { classifyApiError, ApiErrorType, withRetry } from './errors';

describe('classifyApiError', () => {
  test('classifies timeout errors', () => {
    const error = new Error('timeout');
    error.name = 'TimeoutError';
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.Timeout);
    expect(result.retryable).toBe(true);
  });

  test('classifies 429 rate limit', () => {
    const error: any = new Error('rate limited');
    error.status = 429;
    error.isRateLimitError = true;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.RateLimit);
    expect(result.retryable).toBe(true);
  });

  test('classifies 401 auth errors as non-retryable', () => {
    const error: any = new Error('unauthorized');
    error.status = 401;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.Authentication);
    expect(result.retryable).toBe(false);
  });

  test('classifies 403 as auth error', () => {
    const error: any = new Error('forbidden');
    error.status = 403;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.Authentication);
    expect(result.retryable).toBe(false);
  });

  test('classifies 400 with context overflow pattern', () => {
    const error: any = new Error('prompt is too long: exceeds the context window');
    error.status = 400;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.ContextOverflow);
    expect(result.retryable).toBe(false);
  });

  test('classifies 413 as context overflow', () => {
    const error: any = new Error('request entity too large');
    error.status = 413;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.ContextOverflow);
    expect(result.retryable).toBe(false);
  });

  test('classifies 500 as server error (retryable)', () => {
    const error: any = new Error('internal server error');
    error.status = 500;
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.ServerError);
    expect(result.retryable).toBe(true);
  });

  test('classifies 502/503 as server error (retryable)', () => {
    for (const status of [502, 503, 504]) {
      const error: any = new Error('bad gateway');
      error.status = status;
      const result = classifyApiError(error);
      expect(result.type).toBe(ApiErrorType.ServerError);
      expect(result.retryable).toBe(true);
    }
  });

  test('classifies unknown errors as non-retryable', () => {
    const result = classifyApiError('something went wrong');
    expect(result.type).toBe(ApiErrorType.Unknown);
    expect(result.retryable).toBe(false);
  });

  test('classifies ETIMEDOUT as timeout', () => {
    const error: any = new Error('connection timed out');
    error.code = 'ETIMEDOUT';
    const result = classifyApiError(error);
    expect(result.type).toBe(ApiErrorType.Timeout);
    expect(result.retryable).toBe(true);
  });

  test('extracts retryAfterMs from rate limit headers', () => {
    const error: any = new Error('rate limited');
    error.status = 429;
    error.isRateLimitError = true;
    error.response = { headers: { get: (name: string) => name === 'retry-after' ? '30' : null } };
    const result = classifyApiError(error);
    expect(result.retryAfterMs).toBe(30000); // 30s * 1000
  });

  test('falls back to 60s retry delay for rate limit without header', () => {
    const error: any = new Error('rate limited');
    error.status = 429;
    error.isRateLimitError = true;
    const result = classifyApiError(error);
    expect(result.retryAfterMs).toBe(60000);
  });
});

describe('withRetry', () => {
  test('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  test('retries retryable errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('server error');
          error.status = 500;
          throw error;
        }
        return Promise.resolve('ok');
      },
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('throws on non-retryable error immediately', async () => {
    const error: any = new Error('unauthorized');
    error.status = 401;
    await expect(
      withRetry(() => Promise.reject(error), { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow();
  });

  test('throws after max retries exceeded', async () => {
    const error: any = new Error('server error');
    error.status = 500;
    await expect(
      withRetry(() => Promise.reject(error), { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 }),
    ).rejects.toThrow();
  });
});
```

---

### 3. `utils/binaryDetection.ts` (118 lines)

**Why:** File safety logic — wrong classification means corrupt file reads or wasted context. `isBinaryExtension` is a pure lookup, `isBinaryFile` reads from disk but can be tested with temp files.

```typescript
// src/utils/binaryDetection.test.ts
import { describe, test, expect } from 'bun:test';
import { isBinaryExtension, isBinaryFile } from './binaryDetection';

describe('isBinaryExtension', () => {
  test('recognizes common binary extensions', () => {
    expect(isBinaryExtension('.png')).toBe(true);
    expect(isBinaryExtension('.jpg')).toBe(true);
    expect(isBinaryExtension('.zip')).toBe(true);
    expect(isBinaryExtension('.exe')).toBe(true);
    expect(isBinaryExtension('.pdf')).toBe(true);
    expect(isBinaryExtension('.mp4')).toBe(true);
    expect(isBinaryExtension('.sqlite')).toBe(true);
  });

  test('rejects text extensions', () => {
    expect(isBinaryExtension('.ts')).toBe(false);
    expect(isBinaryExtension('.js')).toBe(false);
    expect(isBinaryExtension('.md')).toBe(false);
    expect(isBinaryExtension('.json')).toBe(false);
  });

  test('handles case insensitivity', () => {
    expect(isBinaryExtension('.PNG')).toBe(true);
    expect(isBinaryExtension('.Jpg')).toBe(true);
  });

  test('handles undefined', () => {
    expect(isBinaryExtension(undefined)).toBe(false);
  });
});

describe('isBinaryFile', () => {
  test('detects text files as non-binary', async () => {
    // Create a temp text file
    const path = `/tmp/test-binary-${Date.now()}.txt`;
    await Bun.write(path, 'hello world');
    const result = await isBinaryFile(path, 11);
    expect(result).toBe(false);
  });

  test('detects files with null bytes as binary', async () => {
    const path = `/tmp/test-binary-${Date.now()}.bin`;
    const buffer = new Uint8Array([0x48, 0x65, 0x00, 0x6c, 0x6c, 0x6f]); // "He\0llo"
    await Bun.write(path, buffer);
    const result = await isBinaryFile(path, 6);
    expect(result).toBe(true);
  });

  test('returns false for empty files', async () => {
    const path = `/tmp/test-binary-${Date.now()}.txt`;
    await Bun.write(path, '');
    const result = await isBinaryFile(path, 0);
    expect(result).toBe(false);
  });
});
```

---

### 4. `core/part-utils.ts` (58 lines)

**Why:** Small but critical — type guards and input parsing used by the entire message pipeline.

```typescript
// src/core/part-utils.test.ts
import { describe, test, expect } from 'bun:test';
import { isTextPart, isToolPart, isImagePart, isFilePart, parseToolInput, createStepPart } from './part-utils';

describe('type guards', () => {
  test('isTextPart', () => {
    expect(isTextPart({ type: 'text', text: 'hi' })).toBe(true);
    expect(isTextPart({ type: 'tool' })).toBe(false);
  });

  test('isToolPart', () => {
    expect(isToolPart({ type: 'tool', callId: 'x' })).toBe(true);
    expect(isToolPart({ type: 'text' })).toBe(false);
  });

  test('isImagePart', () => {
    expect(isImagePart({ type: 'image', url: 'http://x' })).toBe(true);
  });

  test('isFilePart', () => {
    expect(isFilePart({ type: 'file', filename: 'a.txt' })).toBe(true);
  });
});

describe('parseToolInput', () => {
  test('parses JSON string input', () => {
    expect(parseToolInput('{"path": "/foo"}')).toEqual({ path: '/foo' });
  });

  test('returns empty object for invalid JSON string', () => {
    expect(parseToolInput('not json')).toEqual({});
  });

  test('returns object as-is', () => {
    expect(parseToolInput({ path: '/foo' })).toEqual({ path: '/foo' });
  });

  test('returns empty object for null/undefined', () => {
    expect(parseToolInput(null)).toEqual({});
    expect(parseToolInput(undefined)).toEqual({});
  });

  test('returns empty object for primitives', () => {
    expect(parseToolInput(42)).toEqual({});
    expect(parseToolInput(true)).toEqual({});
  });
});

describe('createStepPart', () => {
  test('creates step part with required fields', () => {
    const part = createStepPart({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      number: 1,
      status: 'started',
    });
    expect(part.type).toBe('step');
    expect(part.number).toBe(1);
    expect(part.status).toBe('started');
    expect(part.id).toBeDefined();
    expect(part.messageId).toBe('msg-1');
  });

  test('includes optional fields when provided', () => {
    const part = createStepPart({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      number: 1,
      status: 'finished',
      finishReason: 'stop',
      tokens: { prompt: 100, completion: 50 },
    });
    expect(part.finishReason).toBe('stop');
    expect(part.tokens).toEqual({ prompt: 100, completion: 50 });
  });
});
```

---

### 5. `core/error-handling.ts` (19 lines)

Tiny module — test it in 2 minutes:

```typescript
// src/core/error-handling.test.ts
import { describe, test, expect } from 'bun:test';
import { createErrorEvent } from './error-handling';
import { classifyApiError, ApiErrorType } from '@/utils/errors';

describe('createErrorEvent', () => {
  test('creates auth error event', () => {
    const classified = classifyApiError(Object.assign(new Error('unauthorized'), { status: 401 }));
    const event = createErrorEvent(classified);
    expect(event.type).toBe('error.auth');
  });

  test('creates context overflow error event', () => {
    const classified = classifyApiError(Object.assign(new Error('context_length_exceeded'), { status: 400 }));
    const event = createErrorEvent(classified);
    expect(event.type).toBe('error.context_overflow');
  });

  test('creates generic error event for unknown errors', () => {
    const classified = classifyApiError(new Error('something broke'));
    const event = createErrorEvent(classified);
    expect(event.type).toBe('error');
  });
});
```

---

## Estimated Effort

| Module | Lines | Test Cases | Time |
|--------|-------|------------|------|
| strip-visualization | 51 | ~8 | 10 min |
| errors (classifyApiError + withRetry) | 199 | ~15 | 25 min |
| binaryDetection | 118 | ~8 | 15 min |
| part-utils | 58 | ~12 | 10 min |
| error-handling | 19 | ~4 | 5 min |
| **Total** | **445** | **~47** | **~65 min** |

47 test cases covering 5 modules in about an hour. This catches edge cases in error classification, visualization stripping, and input parsing — all of which have bitten us before.
