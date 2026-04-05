export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ConfigurationValidationError extends ConfigurationError {
  constructor(message: string, public readonly details?: string[]) {
    super(message);
    this.name = 'ConfigurationValidationError';
  }
}

export class ConfigurationNotFoundError extends ConfigurationError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'ConfigurationNotFoundError';
  }
}

export class ConfigurationConflictError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationConflictError';
  }
}

export class ConfigurationPersistenceError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationPersistenceError';
  }
}

export class ForbiddenDeleteError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenDeleteError';
  }
}
