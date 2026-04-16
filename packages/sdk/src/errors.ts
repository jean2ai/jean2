export class Jean2Error extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'Jean2Error';
  }
}

export class ConnectionError extends Jean2Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

export class AuthError extends Jean2Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Jean2Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Jean2Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TimeoutError';
  }
}

export class ServerError extends Jean2Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServerError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Jean2Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}
