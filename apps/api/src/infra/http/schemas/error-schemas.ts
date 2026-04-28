import { z } from "zod/v4";

/**
 * Base error response schema
 * All errors return this structure
 */
export const errorResponseSchema = z.object({
  error: z
    .string()
    .describe("Error code (e.g., 'VALIDATION_ERROR', 'UNAUTHORIZED')"),
  message: z.string().describe("Human-readable error message"),
  statusCode: z.number().describe("HTTP status code"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  path: z.string().optional().describe("Request path"),
  code: z.string().optional().describe("Additional error code"),
  details: z
    .any()
    .optional()
    .describe("Additional error details (e.g., validation errors)"),
});

/**
 * Common error response schemas for different HTTP status codes
 */
export const errorSchemas = {
  // 400 Bad Request
  badRequest: errorResponseSchema.describe("Bad Request - Invalid input data"),

  // 401 Unauthorized
  unauthorized: errorResponseSchema.describe(
    "Unauthorized - Authentication required or failed",
  ),

  // 403 Forbidden
  forbidden: errorResponseSchema.describe(
    "Forbidden - Insufficient permissions",
  ),

  // 404 Not Found
  notFound: errorResponseSchema.describe("Not Found - Resource does not exist"),

  // 409 Conflict
  conflict: errorResponseSchema.describe(
    "Conflict - Resource already exists or state conflict",
  ),

  // 422 Unprocessable Entity
  unprocessableEntity: errorResponseSchema.describe(
    "Unprocessable Entity - Validation failed",
  ),

  // 500 Internal Server Error
  internalServerError: errorResponseSchema.describe(
    "Internal Server Error - Server-side error",
  ),
} as const;

/**
 * Validation error response schema with detailed field-level errors
 */
export const validationErrorResponseSchema = errorResponseSchema.extend({
  details: z
    .array(
      z.object({
        path: z.string().describe("Field path (e.g., 'email', 'user.name')"),
        message: z.string().describe("Validation error message"),
      }),
    )
    .optional(),
});

/**
 * Helper to create common error responses for route schemas
 * @example
 * ```typescript
 * {
 *   schema: {
 *     response: {
 *       201: successSchema,
 *       ...commonErrorResponses(['badRequest', 'unauthorized', 'conflict'])
 *     }
 *   }
 * }
 * ```
 */
export function commonErrorResponses(
  errorTypes: Array<keyof typeof errorSchemas>,
): Record<number, z.ZodSchema> {
  const statusCodeMap = {
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    unprocessableEntity: 422,
    internalServerError: 500,
  };

  const responses: Record<number, z.ZodSchema> = {};

  for (const errorType of errorTypes) {
    const statusCode = statusCodeMap[errorType];
    responses[statusCode] = errorSchemas[errorType];
  }

  return responses;
}

/**
 * All possible error responses (use when you want to cover all bases)
 */
export const allErrorResponses = {
  400: errorSchemas.badRequest,
  401: errorSchemas.unauthorized,
  403: errorSchemas.forbidden,
  404: errorSchemas.notFound,
  409: errorSchemas.conflict,
  422: errorSchemas.unprocessableEntity,
  500: errorSchemas.internalServerError,
} as const;
