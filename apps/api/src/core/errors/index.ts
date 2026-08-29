export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;

  /**
   * The machine-readable `code` this error answers with.
   *
   * The global handler otherwise derives it from the class name
   * (`NotFoundError` -> `NOTFOUND`), which is fine for the generic HTTP shapes
   * but cannot produce a snake-cased domain code: `EmailNotVerifiedError` would
   * become `EMAILNOTVERIFIED`, and a client branching on the code would be
   * branching on a string nobody would ever write down. Subclasses that are
   * part of a published contract set this explicitly.
   */
  readonly errorCode?: string;

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

export class InvalidCredentialsError extends UnauthorizedError {
  constructor(message: string = "Invalid email or password", cause?: Error) {
    super(message, cause);
  }
}

/**
 * A password login against an account whose address has not been proved.
 *
 * 403, not 401: the credentials were CORRECT. A 401 would send the web client
 * into its refresh-then-sign-out path and show "wrong password", which is both
 * wrong and unactionable — the user's actual next step is to open their inbox
 * or ask for a new link.
 */
export class EmailNotVerifiedError extends ForbiddenError {
  readonly errorCode = "EMAIL_NOT_VERIFIED";

  constructor(
    message: string = "Confirm your email address before signing in. Check your inbox for the verification link, or request a new one.",
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * ONE error for every way a PASSWORD RESET token can fail — unknown, expired,
 * already used, or pointing at a user who no longer exists.
 *
 * Separate from `InvalidVerificationTokenError` because the two links land on
 * two different screens and the client has to be able to tell them apart; the
 * indistinguishability that matters is WITHIN each kind, not across them.
 */
export class InvalidResetTokenError extends BadRequestError {
  readonly errorCode = "INVALID_RESET_TOKEN";

  constructor(
    message: string = "This password reset link is invalid or has expired. Request a new one.",
    cause?: Error,
  ) {
    super(message, cause);
  }
}

/**
 * ONE error for every way a verification token can fail — unknown, expired,
 * already used, or pointing at a user who no longer exists.
 *
 * Deliberately undifferentiated: telling a caller "expired" rather than
 * "unknown" confirms that the token was real, which is the only useful signal
 * an attacker guessing tokens could get back.
 */
export class InvalidVerificationTokenError extends BadRequestError {
  readonly errorCode = "INVALID_VERIFICATION_TOKEN";

  constructor(
    message: string = "This verification link is invalid or has expired. Request a new one.",
    cause?: Error,
  ) {
    super(message, cause);
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
