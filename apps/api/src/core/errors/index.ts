export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;

  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends BaseError {
  readonly statusCode = 400;
  readonly isOperational = true;

  constructor(message: string = "Bad Request", cause?: Error) {
    super(message, cause);
  }
}

export class UnauthorizedError extends BaseError {
  readonly statusCode = 401;
  readonly isOperational = true;

  constructor(message: string = "Unauthorized", cause?: Error) {
    super(message, cause);
  }
}

export class ForbiddenError extends BaseError {
  readonly statusCode = 403;
  readonly isOperational = true;

  constructor(message: string = "Forbidden", cause?: Error) {
    super(message, cause);
  }
}

export class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly isOperational = true;

  constructor(message: string = "Not Found", cause?: Error) {
    super(message, cause);
  }
}

export class ConflictError extends BaseError {
  readonly statusCode = 409;
  readonly isOperational = true;

  constructor(message: string = "Conflict", cause?: Error) {
    super(message, cause);
  }
}

export class UnprocessableEntityError extends BaseError {
  readonly statusCode = 422;
  readonly isOperational = true;

  constructor(message: string = "Unprocessable Entity", cause?: Error) {
    super(message, cause);
  }
}

export class InternalServerError extends BaseError {
  readonly statusCode = 500;
  readonly isOperational = false;

  constructor(message: string = "Internal Server Error", cause?: Error) {
    super(message, cause);
  }
}

export class ServiceUnavailableError extends BaseError {
  readonly statusCode = 503;
  readonly isOperational = true;

  constructor(message: string = "Service Unavailable", cause?: Error) {
    super(message, cause);
  }
}

// Domain-specific errors
export class ValidationError extends BadRequestError {
  constructor(message: string = "Validation failed", cause?: Error) {
    super(message, cause);
  }
}

export class DuplicateResourceError extends ConflictError {
  constructor(resource: string, field: string, value: string, cause?: Error) {
    super(`${resource} with ${field} '${value}' already exists`, cause);
  }
}

export class ResourceNotFoundError extends NotFoundError {
  constructor(resource: string, identifier: string, cause?: Error) {
    super(`${resource} with identifier '${identifier}' not found`, cause);
  }
}

// Legacy compatibility
export class AppError extends BaseError {
  readonly statusCode: number;
  readonly isOperational = true;

  constructor(message: string, statusCode: number = 400, cause?: Error) {
    super(message, cause);
    this.statusCode = statusCode;
  }
}

export const isOperationalError = (error: Error): boolean => {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
};
