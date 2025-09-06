import {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
} from "fastify";
import {
  BaseError,
  isOperationalError,
  InternalServerError,
} from "../../../core/errors/index.js";

export interface CustomError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = async (
  error: FastifyError | CustomError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Log the error
  request.server.log.error(error);

  // Handle operational errors (our custom errors)
  if (error instanceof BaseError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      statusCode: error.statusCode,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }

  // Handle Fastify validation errors
  if ("validation" in error && error.validation) {
    return reply.status(400).send({
      error: "Validation Error",
      details: error.validation,
      statusCode: 400,
    });
  }

  // Handle Zod validation errors
  if (error.name === "ZodError") {
    return reply.status(400).send({
      error: "Validation Error",
      details: error.message,
      statusCode: 400,
    });
  }

  // Handle database unique constraint errors (PostgreSQL)
  if (
    error.message?.includes("duplicate key value") ||
    error.message?.includes("unique constraint")
  ) {
    return reply.status(409).send({
      error: "Resource already exists",
      statusCode: 409,
    });
  }

  // Handle other operational errors
  if (isOperationalError(error)) {
    const statusCode = (error as CustomError).statusCode || 500;
    return reply.status(statusCode).send({
      error: error.message,
      statusCode,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }

  // Handle unknown/programming errors
  const internalError = new InternalServerError(
    process.env.NODE_ENV === "production"
      ? "Something went wrong"
      : error.message
  );

  return reply.status(500).send({
    error: internalError.message,
    statusCode: 500,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
};

export const registerErrorHandler = (server: FastifyInstance) => {
  server.setErrorHandler(errorHandler);
};
