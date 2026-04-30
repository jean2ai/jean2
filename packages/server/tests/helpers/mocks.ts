import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';

// ── Broadcast mock ──────────────────────────────────────────────

/**
 * Mock broadcast callback that captures all messages.
 * Use in tests that exercise code calling broadcastEvent().
 */
export function createMockBroadcast() {
  const messages: unknown[] = [];

  return {
    callback: (message: unknown) => {
      messages.push(message);
    },
    messages,
    clear() {
      messages.length = 0;
    },
    last() {
      return messages[messages.length - 1];
    },
  };
}

// ── AI SDK Model mocks ──────────────────────────────────────────
//
// The AI SDK (v6) ships test utilities in `ai/test`:
//   - MockLanguageModelV3 — mock model for generateText / streamText
//   - mockId              — incrementing integer ID generator
//   - mockValues          — cycle through an array of values
//
// Import simulateReadableStream from `ai` (not `ai/test`) for
// controllable streaming in streamText tests.
//
// Key difference from older tutorials: AI SDK v6 uses the V3 spec.
// The doGenerate result uses `content` (not `text`), and
// finishReason/usage have a nested object shape.
//
// @see https://ai-sdk.dev/docs/ai-sdk-core/testing

/**
 * Create a mock LanguageModel for use with `generateText`.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createMockGenerateModel } from '#tests/mocks';
 *
 * const model = createMockGenerateModel({ text: 'Summary of conversation' });
 * const result = await generateText({ model, prompt: 'Summarize' });
 * expect(result.text).toBe('Summary of conversation');
 * ```
 */
export function createMockGenerateModel(options: {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: options.text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: {
          total: options.usage?.inputTokens ?? 10,
          noCache: options.usage?.inputTokens ?? 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: options.usage?.outputTokens ?? 20,
          text: options.usage?.outputTokens ?? 20,
          reasoning: undefined,
        },
      },
      warnings: [],
    }),
  });
}

/**
 * Create a mock LanguageModel for use with `streamText`.
 *
 * Uses `simulateReadableStream` from `ai` to produce controllable
 * text chunks with realistic timing.
 *
 * @example
 * ```typescript
 * import { streamText } from 'ai';
 * import { createMockStreamModel } from '#tests/mocks';
 *
 * const model = createMockStreamModel({
 *   chunks: ['Hello', ', ', 'world!'],
 * });
 * const result = streamText({ model, prompt: 'Hi' });
 * for await (const chunk of result.textStream) {
 *   // 'Hello', ', ', 'world!'
 * }
 * ```
 */
export function createMockStreamModel(options: {
  chunks: string[];
  finishReason?: 'stop' | 'length' | 'tool-calls' | 'error';
  usage?: { inputTokens?: number; outputTokens?: number };
}) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          ...options.chunks.map((delta) => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta,
          })),
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: {
              unified: options.finishReason ?? 'stop',
              raw: undefined,
            },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: options.usage?.inputTokens ?? 10,
                noCache: options.usage?.inputTokens ?? 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: options.usage?.outputTokens ?? 20,
                text: options.usage?.outputTokens ?? 20,
                reasoning: undefined,
              },
            },
          },
        ],
      }),
    }),
  });
}

/**
 * Create a mock LanguageModel that simulates tool calling via streamText.
 *
 * Produces a stream with tool-call chunks, optional tool-result chunks,
 * and an optional final text response.
 *
 * @example
 * ```typescript
 * const model = createMockToolCallModel({
 *   toolCalls: [{
 *     toolName: 'read-file',
 *     args: { path: '/test.txt' },
 *     toolCallId: 'call-1',
 *   }],
 *   toolResults: [{
 *     toolCallId: 'call-1',
 *     toolName: 'read-file',
 *     result: 'file contents here',
 *   }],
 *   finalText: 'I read the file.',
 * });
 * ```
 */
export function createMockToolCallModel(options: {
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    toolCallId: string;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    result: string;
  }>;
  finalText?: string;
}) {
  const calls = options.toolCalls.map((tc) => ({
    type: 'tool-call' as const,
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    input: JSON.stringify(tc.args),
  }));

  const results = options.toolResults?.map((r) => ({
    type: 'tool-result' as const,
    toolCallId: r.toolCallId,
    toolName: r.toolName,
    result: r.result,
  }));

  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          ...calls,
          ...(results ?? []),
          ...(options.finalText
            ? [
                { type: 'text-start' as const, id: 'text-1' },
                { type: 'text-delta' as const, id: 'text-1', delta: options.finalText },
                { type: 'text-end' as const, id: 'text-1' },
              ]
            : []),
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 100, text: 100, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}
