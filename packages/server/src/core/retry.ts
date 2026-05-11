import type { ChatOptions } from './agent';
import { classifyApiError, ApiErrorType, ERROR_RATE_LIMIT, ERROR_SERVER_ERROR, ERROR_TIMEOUT, ERROR_CHAT_FAILED } from '@/utils/errors';
import type { ClassifiedError } from '@/utils/errors';
import type { MessageEvent, RateLimitErrorMessage, ServerErrorMessage, TimeoutErrorMessage, ContextOverflowErrorMessage, InvalidRequestErrorMessage, AuthErrorMessage, ErrorMessage, AssistantMessage } from '@jean2/sdk';
import { updateMessage } from '@/store';

/** The union of all events that streamChat can yield (or retry wraps). */
export type StreamChatEvent =
  | MessageEvent
  | { type: 'usage'; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string; variant: string | null }
  | { type: 'needs_compaction'; sessionId: string }
  | RateLimitErrorMessage
  | ServerErrorMessage
  | TimeoutErrorMessage
  | AuthErrorMessage
  | ContextOverflowErrorMessage
  | InvalidRequestErrorMessage
  | ErrorMessage;

/** A stream factory function matching the signature of agent.ts streamChat. */
export type StreamChatFn = (options: ChatOptions) => AsyncGenerator<StreamChatEvent>;

export async function* streamChatWithRetry(
  options: ChatOptions,
  streamChatFn?: StreamChatFn,
): AsyncGenerator<StreamChatEvent> {
  let retries = 0;
  const maxRetries = 3;
  let _lastError: ReturnType<typeof classifyApiError> | null = null;
  let lastAssistantMessage: AssistantMessage | null = null;

  while (retries <= maxRetries) {
    try {
      const stream = streamChatFn ?? (await import('./agent')).streamChat;
      for await (const event of stream(options)) {
        if (event.type === 'message.created' || event.type === 'message.updated') {
          const msg = event.message;
          if (msg.role === 'assistant') {
            lastAssistantMessage = msg as AssistantMessage;
          }
        }
        yield event;
      }
      return;
    } catch (err) {
      const classifiedError = isClassifiedError(err) ? err : classifyApiError(err);
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
        if (lastAssistantMessage) {
          const errorMessage: AssistantMessage = {
            ...lastAssistantMessage,
            status: 'error',
            error: classifiedError.message,
          };
          yield { type: 'message.updated', message: errorMessage };
          updateMessage(lastAssistantMessage.id, errorMessage);
        }

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

function isClassifiedError(err: unknown): err is ClassifiedError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    'retryable' in err &&
    'message' in err &&
    'originalError' in err
  );
}
