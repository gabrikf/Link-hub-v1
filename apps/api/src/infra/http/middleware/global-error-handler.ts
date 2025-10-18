import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  BaseError,
  DuplicateResourceError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  BadRequestError,
  InternalServerError,
} from "../../../core/errors/index.js";

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

/**
 * Global error handler for Fastify
 * Handles all types of errors and returns appropriate HTTP responses
 */
export async function errorHandler(
  error: Error | FastifyError | ZodError | BaseError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error for debugging (in production, use a proper logger)
  console.error("Error caught by global handler:", {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    path: request.url,
    method: request.method,
  });

  // Default error response
  let statusCode = 500;
  let errorMessage = "Internal Server Error";
  let errorCode: string | undefined;
  let details: unknown;

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    statusCode = 400;
    errorMessage = "Validation Error";
    errorCode = "VALIDATION_ERROR";
    details = error.issues.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));
  }
  // Handle Duplicate Resource Error
  else if (error instanceof DuplicateResourceError) {
    statusCode = 409;
    errorMessage = error.message;
    errorCode = "DUPLICATE_RESOURCE";
  }
  // Handle all BaseError subclasses (custom application errors)
  else if (error instanceof BaseError) {
    statusCode = error.statusCode;
    errorMessage = error.message;
    errorCode = error.constructor.name.replace("Error", "").toUpperCase();
  }
  // Handle Fastify validation errors
  else if ("validation" in error && error.validation) {
    statusCode = 400;
    errorMessage = "Validation Error";
    errorCode = "VALIDATION_ERROR";
    details = error.validation;
  }
  // Handle Fastify JSON parsing errors
  else if (
    "statusCode" in error &&
    error.statusCode === 400 &&
    error.message.includes("JSON")
  ) {
    statusCode = 400;
    errorMessage = "Invalid JSON format in request body";
    errorCode = "INVALID_JSON";
  }
  // Handle Fastify errors with status code
  else if ("statusCode" in error && error.statusCode) {
    statusCode = error.statusCode;
    errorMessage = error.message;
    // Clean up generic Fastify error messages
    if (errorMessage.includes("FST_ERR_")) {
      errorCode = errorMessage.match(/FST_ERR_[A-Z_]+/)?.[0];
      errorMessage = error.message.replace(/FST_ERR_[A-Z_]+: /, "");
    }
  }
  // Handle specific error types by name
  else {
    switch (error.name) {
      case "FastifyError":
        // Handle specific Fastify errors
        if (error.message.includes("JSON")) {
          statusCode = 400;
          errorMessage = "Invalid JSON format in request body";
          errorCode = "INVALID_JSON";
        } else if (error.message.includes("body-limit")) {
          statusCode = 413;
          errorMessage = "Request body too large";
          errorCode = "PAYLOAD_TOO_LARGE";
        } else if (error.message.includes("querystring")) {
          statusCode = 400;
          errorMessage = "Invalid query string";
          errorCode = "INVALID_QUERY";
        } else {
          statusCode = ("statusCode" in error && error.statusCode) || 500;
          errorMessage = error.message;
          errorCode = "FASTIFY_ERROR";
        }
        break;
      case "UnauthorizedError":
      case "JsonWebTokenError":
      case "TokenExpiredError":
        statusCode = 401;
        errorMessage = "Unauthorized";
        errorCode = "UNAUTHORIZED";
        break;
      case "ForbiddenError":
        statusCode = 403;
        errorMessage = "Forbidden";
        errorCode = "FORBIDDEN";
        break;
      case "NotFoundError":
        statusCode = 404;
        errorMessage = "Resource Not Found";
        errorCode = "NOT_FOUND";
        break;
      case "ConflictError":
        statusCode = 409;
        errorMessage = error.message || "Conflict";
        errorCode = "CONFLICT";
        break;
      case "ValidationError":
        statusCode = 422;
        errorMessage = error.message || "Validation Failed";
        errorCode = "VALIDATION_ERROR";
        break;
      case "DatabaseError":
      case "DrizzleError":
        statusCode = 500;
        errorMessage = "Database Error";
        errorCode = "DATABASE_ERROR";
        // Don't expose database errors to client in production
        if (process.env.NODE_ENV === "development") {
          errorMessage = error.message;
        }
        break;
      default:
        // Generic error handling
        statusCode = 500;
        errorMessage = "Internal Server Error";
        errorCode = "INTERNAL_ERROR";
        // Only show detailed error message in development
        if (process.env.NODE_ENV === "development") {
          errorMessage = error.message;
        }
    }
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
