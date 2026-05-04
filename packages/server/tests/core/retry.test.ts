import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { streamChatWithRetry } from '@/core/retry';
import type { StreamChatFn, StreamChatEvent } from '@/core/retry';
import type { ChatOptions } from '@/core/agent';

// Helper to create AI-SDK-compatible errors
function createError(overrides: {
  message: string;
  status?: number;
  isRateLimitError?: boolean;
  isRetryableError?: boolean;
  retryAfterHeader?: string;
}) {
  const error = new Error(overrides.message) as Error & {
    status?: number;
    isRateLimitError?: boolean;
    isRetryableError?: boolean;
    response?: { headers: { get: (name: string) => string | null } };
  };
  if (overrides.status !== undefined) error.status = overrides.status;
  if (overrides.isRateLimitError) error.isRateLimitError = overrides.isRateLimitError;
  if (overrides.isRetryableError) error.isRetryableError = overrides.isRetryableError;
  if (overrides.retryAfterHeader) {
    error.response = {
      headers: {
        get: (name: string) => name === 'retry-after' ? overrides.retryAfterHeader! : null,
      },
    };
  }
  return error;
}

// Mock setTimeout to skip delays in retry tests
const originalSetTimeout = globalThis.setTimeout;

function mockSetTimeout() {
  globalThis.setTimeout = ((fn: () => void, _ms?: number) => originalSetTimeout(fn, 0)) as typeof setTimeout;
}

function restoreSetTimeout() {
  globalThis.setTimeout = originalSetTimeout;
}

function makeOptions(overrides: Partial<ChatOptions> = {}): ChatOptions {
  return {
    sessionId: 'test-session',
    preconfig: {
      id: 'test',
      name: 'test',
      description: '',
      systemPrompt: '',
      tools: [],
      model: null,
      provider: null,
      settings: null,
      isDefault: false,
    },
    messages: [],
    ...overrides,
  };
}

/** Collect all events from an async generator into an array. */
async function collect(gen: AsyncGenerator<StreamChatEvent>): Promise<StreamChatEvent[]> {
  const events: StreamChatEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('streamChatWithRetry', () => {
  beforeEach(() => {
    mockSetTimeout();
  });

  afterEach(() => {
    restoreSetTimeout();
  });

  test('yields events from successful stream', async () => {
    let callCount = 0;
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      yield { type: 'message.created', message: { id: 'm1', role: 'user', sessionId: 's1', createdAt: 0 } } as StreamChatEvent;
      yield { type: 'part.created', sessionId: 's1', part: { id: 'p1', type: 'text', text: 'Hello' } } as StreamChatEvent;
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(2);
    expect(callCount).toBe(1);
  });

  test('retries on retryable errors and eventually succeeds', async () => {
    let callCount = 0;
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      if (callCount <= 2) {
        throw createError({ message: 'Internal server error', status: 500 });
      }
      yield { type: 'message.created', message: { id: 'm1', role: 'user', sessionId: 's1', createdAt: 0 } } as StreamChatEvent;
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(1);
    expect(callCount).toBe(3);
  });

  test('yields rate limit error event when max retries hit', async () => {
    let callCount = 0;
    // eslint-disable-next-line require-yield
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      throw createError({
        message: 'Rate limit exceeded',
        status: 429,
        retryAfterHeader: '0',
      });
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(1);
    const errorEvent = events[0] as { type: string; code: string };
    expect(errorEvent.type).toBe('error.rate_limit');
    expect(errorEvent.code).toBe('rate_limit');
    expect(callCount).toBe(4);
  });

  test('yields context overflow error without retrying', async () => {
    let callCount = 0;
    // eslint-disable-next-line require-yield
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      throw createError({
        message: 'context window exceeds limit',
        status: 400,
      });
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(1);
    const errorEvent = events[0] as { type: string };
    expect(errorEvent.type).toBe('error.context_overflow');
    expect(callCount).toBe(1);
  });

  test('yields server error when max retries exceeded', async () => {
    let callCount = 0;
    // eslint-disable-next-line require-yield
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      throw createError({ message: 'Server error', status: 500 });
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(1);
    const errorEvent = events[0] as { type: string; code: string };
    expect(errorEvent.type).toBe('error.server');
    expect(callCount).toBe(4);
  });

  test('yields generic error for non-retryable unknown errors', async () => {
    let callCount = 0;
    // eslint-disable-next-line require-yield
    const mockStream: StreamChatFn = async function* (_options: ChatOptions) {
      callCount++;
      throw new Error('Something unexpected');
    };

    const events = await collect(streamChatWithRetry(makeOptions(), mockStream));

    expect(events).toHaveLength(1);
    const errorEvent = events[0] as { type: string; code: string };
    expect(errorEvent.type).toBe('error');
    expect(errorEvent.code).toBe('chat_error');
    expect(callCount).toBe(1);
  });
});
