import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod/v4";
import {
  BaseError,
  DuplicateResourceError,
} from "../../../core/errors/index.js";
import { captureApiException } from "../../observability/sentry.js";
import { structuredLoggingEnabled } from "../../config/app-config.js";

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

interface ResolvedError {
  statusCode: number;
  errorMessage: string;
  errorCode?: string;
  details?: unknown;
}

/**
 * Handles the "FastifyError" branch of `resolveErrorByName`: by the time we
 * get here, `resolveErrorDetails` has already ruled out a truthy
 * `error.statusCode`, so the only signal left is the message text.
 */
function resolveFastifyErrorByMessage(message: string): ResolvedError {
  if (message.includes("JSON")) {
    return {
      statusCode: 400,
      errorMessage: "Invalid JSON format in request body",
      errorCode: "INVALID_JSON",
    };
  }
  if (message.includes("body-limit")) {
    return {
      statusCode: 413,
      errorMessage: "Request body too large",
      errorCode: "PAYLOAD_TOO_LARGE",
    };
  }
  if (message.includes("querystring")) {
    return {
      statusCode: 400,
      errorMessage: "Invalid query string",
      errorCode: "INVALID_QUERY",
    };
  }
  return { statusCode: 500, errorMessage: message, errorCode: "FASTIFY_ERROR" };
}

/**
 * Fallback resolution for errors that are not `ZodError`,
 * `DuplicateResourceError`, `BaseError`, and do not carry a usable
 * `validation` or `statusCode` field — dispatched by `error.name`.
 */
function resolveErrorByName(name: string, message: string): ResolvedError {
  switch (name) {
    case "FastifyError":
      return resolveFastifyErrorByMessage(message);
    case "UnauthorizedError":
    case "JsonWebTokenError":
    case "TokenExpiredError":
      return {
        statusCode: 401,
        errorMessage: "Unauthorized",
        errorCode: "UNAUTHORIZED",
      };
    case "ForbiddenError":
      return {
        statusCode: 403,
        errorMessage: "Forbidden",
        errorCode: "FORBIDDEN",
      };
    case "NotFoundError":
      return {
        statusCode: 404,
        errorMessage: "Resource Not Found",
        errorCode: "NOT_FOUND",
      };
    case "ConflictError":
      return {
        statusCode: 409,
        errorMessage: message || "Conflict",
        errorCode: "CONFLICT",
      };
    case "ValidationError":
      return {
        statusCode: 422,
        errorMessage: message || "Validation Failed",
        errorCode: "VALIDATION_ERROR",
      };
    case "DatabaseError":
    case "DrizzleError":
      return {
        statusCode: 500,
        // Don't expose database errors to client in production
        errorMessage:
          process.env.NODE_ENV === "development" ? message : "Database Error",
        errorCode: "DATABASE_ERROR",
      };
    default:
      return {
        statusCode: 500,
        // Only show detailed error message in development
        errorMessage:
          process.env.NODE_ENV === "development"
            ? message
            : "Internal Server Error",
        errorCode: "INTERNAL_ERROR",
      };
  }
}

/** Fastify errors that carry their own status code, e.g. `FST_ERR_*`. */
function resolveFastifyStatusError(
  statusCode: number,
  message: string,
): ResolvedError {
  let errorMessage = message;
  let errorCode: string | undefined;
  // Clean up generic Fastify error messages
  if (errorMessage.includes("FST_ERR_")) {
    errorCode = /FST_ERR_[A-Z_]+/.exec(errorMessage)?.[0];
    errorMessage = message.replace(/FST_ERR_[A-Z_]+: /, "");
  }
  return { statusCode, errorMessage, errorCode };
}

/**
 * Turns a caught error into the status code, message, code and optional
 * details the client should see. Extracted from `errorHandler` so each kind
 * of error is a single, flat branch instead of one deeply nested function.
 */
function resolveErrorDetails(
  error: Error | FastifyError | ZodError | BaseError,
): ResolvedError {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      errorMessage: "Validation Error",
      errorCode: "VALIDATION_ERROR",
      details: error.issues.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      })),
    };
  }

  // Handle Duplicate Resource Error
  if (error instanceof DuplicateResourceError) {
    return {
      statusCode: 409,
      errorMessage: error.message,
      errorCode: "DUPLICATE_RESOURCE",
    };
  }

  // Handle all BaseError subclasses (custom application errors)
  if (error instanceof BaseError) {
    return {
      statusCode: error.statusCode,
      errorMessage: error.message,
      // An error that declares its own code wins. The class-name derivation
      // below cannot express a multi-word domain code
      // (`EmailNotVerifiedError` would come out as `EMAILNOTVERIFIED`), so
      // anything a client is expected to branch on sets `errorCode` on the
      // class itself.
      errorCode:
        error.errorCode ??
        error.constructor.name.replace("Error", "").toUpperCase(),
    };
  }

  // Handle Fastify validation errors
  if ("validation" in error && error.validation) {
    return {
      statusCode: 400,
      errorMessage: "Validation Error",
      errorCode: "VALIDATION_ERROR",
      details: error.validation,
    };
  }

  // Handle Fastify JSON parsing errors
  if (
    "statusCode" in error &&
    error.statusCode === 400 &&
    error.message.includes("JSON")
  ) {
    return {
      statusCode: 400,
      errorMessage: "Invalid JSON format in request body",
      errorCode: "INVALID_JSON",
    };
  }

  // Handle Fastify errors with status code
  if ("statusCode" in error && error.statusCode) {
    return resolveFastifyStatusError(error.statusCode, error.message);
  }

  // Handle specific error types by name
  return resolveErrorByName(error.name, error.message);
}

/**
 * Global error handler for Fastify
 * Handles all types of errors and returns appropriate HTTP responses
 */
export async function errorHandler(
  error: Error | FastifyError | ZodError | BaseError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const errorDetails = {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    path: request.url,
    method: request.method,
  };

  // Goes through the request logger so the line carries the request id and, in
  // production, the active trace/span ids. The request body is deliberately
  // never included: it holds signup passwords, resume text and recruiter
  // queries.
  //
  // Development runs with `logger: false` (to keep the local terminal exactly as
  // it was before structured logging landed), and Fastify's no-op logger would
  // swallow this line entirely. Falling back to console.error preserves the
  // behaviour developers rely on today — errors still print while you work.
  if (structuredLoggingEnabled()) {
    request.log.error(errorDetails, "Error caught by global handler");
  } else {
    console.error("Error caught by global handler:", errorDetails);
  }

  const { statusCode, errorMessage, errorCode, details } =
    resolveErrorDetails(error);

  /**
   * Report to Sentry only what a human would actually want to be woken for.
   *
   * A rejected Zod payload or a `NotFoundError` is the API doing its job; if
   * those were sent, the real 500s would be buried under them within a day.
   * Anything that ends up 5xx and is not one of those recognised application
   * errors is, by definition, a bug we did not anticipate.
   */
  const isExpectedClientError =
    error instanceof ZodError ||
    (error instanceof BaseError && statusCode < 500) ||
    ("validation" in error && Boolean(error.validation));

  if (statusCode >= 500 && !isExpectedClientError) {
    captureApiException(error, {
      route: request.routeOptions?.url,
      method: request.method,
      statusCode,
      requestId: request.id,
      userId: request.user?.id,
    });
  }

  // Build error response
  const errorResponse: ErrorResponse = {
    error: errorCode || "ERROR",
    message: errorMessage,
    statusCode,
    timestamp: new Date().toISOString(),
    path: request.url,
  };

  // Add error code if available
  if (errorCode) {
    errorResponse.code = errorCode;
  }

  // Add details in development or for validation errors
  if (
    details &&
    (process.env.NODE_ENV === "development" || statusCode === 400)
  ) {
    errorResponse.details = details;
  }

  // Send error response
  return reply.status(statusCode).send(errorResponse);
}
