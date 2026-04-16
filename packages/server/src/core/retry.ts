import type { ChatOptions } from './agent';
import { classifyApiError, ApiErrorType, ERROR_RATE_LIMIT, ERROR_SERVER_ERROR, ERROR_TIMEOUT, ERROR_CHAT_FAILED } from '@/utils/errors';
import type { MessageEvent, RateLimitErrorMessage, ServerErrorMessage, TimeoutErrorMessage, ContextOverflowErrorMessage, InvalidRequestErrorMessage, AuthErrorMessage, ErrorMessage } from '@jean2/sdk';

export async function* streamChatWithRetry(
  options: ChatOptions
): AsyncGenerator<MessageEvent | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string; variant: string | null } | { type: 'needs_compaction'; sessionId: string } | RateLimitErrorMessage | ServerErrorMessage | TimeoutErrorMessage | AuthErrorMessage | ContextOverflowErrorMessage | InvalidRequestErrorMessage | ErrorMessage> {
  let retries = 0;
  const maxRetries = 3;
  let _lastError: ReturnType<typeof classifyApiError> | null = null;

  while (retries <= maxRetries) {
    try {
      // streamChat is imported dynamically to avoid circular dependency
      const { streamChat } = await import('./agent');
      for await (const event of streamChat(options)) {
        yield event;
      }
      return;
    } catch (err) {
      const classifiedError = classifyApiError(err);
      _lastError = classifiedError;

      console.error('[streamChatWithRetry] AI SDK error', {
        sessionId: options.sessionId,
        model: options.modelId,
        provider: options.providerId,
        attempt: retries + 1,
        maxRetries,
        errorType: classifiedError.type,
        errorMessage: classifiedError.message,
        retryable: classifiedError.retryable,
        rawError: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      });

      if (!classifiedError.retryable || retries === maxRetries) {
        if (classifiedError.type === ApiErrorType.RateLimit) {
          yield {
            type: 'error.rate_limit',
            code: ERROR_RATE_LIMIT,
            message: classifiedError.message,
            retryAfterMs: classifiedError.retryAfterMs || 5000,
          };
        } else if (classifiedError.type === ApiErrorType.ServerError) {
          yield {
            type: 'error.server',
            code: ERROR_SERVER_ERROR,
            message: classifiedError.message,
            retryAfterMs: classifiedError.retryAfterMs,
          };
        } else if (classifiedError.type === ApiErrorType.ContextOverflow) {
          yield {
            type: 'error.context_overflow',
            code: 'context_overflow',
            message: classifiedError.message,
          } as ContextOverflowErrorMessage;
        } else if (classifiedError.type === ApiErrorType.Timeout) {
          yield {
            type: 'error.timeout',
            code: ERROR_TIMEOUT,
            message: classifiedError.message,
            retryAfterMs: classifiedError.retryAfterMs,
          };
        } else {
          yield {
            type: 'error',
            code: ERROR_CHAT_FAILED,
            message: classifiedError.message,
          } as ErrorMessage;
        }
        return;
      }

      retries++;
      console.log(`[streamChat] Retryable error: ${classifiedError.type}, retrying (${retries}/${maxRetries}) in ${classifiedError.retryAfterMs || 1000}ms...`);

      await new Promise(resolve => setTimeout(resolve, classifiedError.retryAfterMs || 1000 * retries));
    }
  }
}
