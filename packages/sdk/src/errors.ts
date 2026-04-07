export class Jean2Error extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, options?: any) {
    super(message, options);
    this.name = 'Jean2Error';
  }
}

export class ConnectionError extends Jean2Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, options?: any) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

export class AuthError extends Jean2Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, options?: any) {
    super(message, options);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Jean2Error {
  readonly retryAfterMs?: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, retryAfterMs?: number, options?: any) {
    super(message, options);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Jean2Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, options?: any) {
    super(message, options);
    this.name = 'TimeoutError';
  }
}

export class ServerError extends Jean2Error {
  readonly statusCode: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, statusCode: number, options?: any) {
    super(message, options);
    this.name = 'ServerError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Jean2Error {
  readonly statusCode: number;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, statusCode: number, options?: any) {
    super(message, options);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}
