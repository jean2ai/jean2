'use strict';

export enum ApiErrorType {
  RateLimit = 'rate_limit',
  ServerError = 'server_error',
  Timeout = 'timeout',
  Authentication = 'authentication',
  InvalidRequest = 'invalid_request',
  Unknown = 'unknown',
}

export interface ClassifiedError {
  type: ApiErrorType;
  retryable: boolean;
  retryAfterMs?: number;
  message: string;
  originalError: unknown;
}

export const ERROR_RATE_LIMIT = 'rate_limit';
export const ERROR_SERVER_ERROR = 'server_error';
export const ERROR_TIMEOUT = 'timeout';
export const ERROR_AUTH = 'authentication';
export const ERROR_INVALID_REQUEST = 'invalid_request';
export const ERROR_CHAT_FAILED = 'chat_error';

interface AiSdkError {
  status?: number;
  isRateLimitError?: boolean;
  isRetryableError?: boolean;
  isTimeoutError?: boolean;
  message?: string;
  name?: string;
  code?: string;
  response?: {
    headers?: {
      get(name: string): string | null;
    };
  };
}

function getRetryAfterMsFromError(error: AiSdkError): number | undefined {
  if (error.response?.headers) {
    const retryAfter = error.response.headers.get('retry-after');
    if (retryAfter) {
      const retryAfterSeconds = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterSeconds)) {
        return retryAfterSeconds * 1000;
      }
    }
  }
  return undefined;
}

export function classifyApiError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  if (error && typeof error === 'object') {
    const aiError = error as AiSdkError;

    if (aiError.isTimeoutError || aiError.name === 'TimeoutError' || aiError.code === 'ETIMEDOUT') {
      return {
        type: ApiErrorType.Timeout,
        retryable: true,
        message,
        originalError: error,
      };
    }

    const status = aiError.status;

    if (aiError.isRateLimitError || status === 429) {
      const retryAfterMs = getRetryAfterMsFromError(aiError) ?? 60000;
      return {
        type: ApiErrorType.RateLimit,
        retryable: true,
        retryAfterMs,
        message,
        originalError: error,
      };
    }

    if (status === 401 || status === 403) {
      return {
        type: ApiErrorType.Authentication,
        retryable: false,
        message,
        originalError: error,
      };
    }

    if (status === 400) {
      return {
        type: ApiErrorType.InvalidRequest,
        retryable: false,
        message,
        originalError: error,
      };
    }

    if (status !== undefined && status >= 500 && status < 600) {
      return {
        type: ApiErrorType.ServerError,
        retryable: true,
        message,
        originalError: error,
      };
    }

    if (aiError.isRetryableError) {
      return {
        type: ApiErrorType.Unknown,
        retryable: true,
        message,
        originalError: error,
      };
    }
  }

  return {
    type: ApiErrorType.Unknown,
    retryable: false,
    message,
    originalError: error,
  };
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, classifiedError: ClassifiedError) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: ClassifiedError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const classifiedError = classifyApiError(err);
      lastError = classifiedError;

      if (!classifiedError.retryable || attempt >= maxRetries) {
        throw classifiedError;
      }

      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const delay = classifiedError.retryAfterMs
        ? Math.max(exponentialDelay, classifiedError.retryAfterMs)
        : exponentialDelay;

      onRetry?.(attempt + 1, classifiedError);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
