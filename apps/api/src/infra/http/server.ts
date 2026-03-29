import fastify from "fastify";
import database from "./pluguins/database.js";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { routes } from "./routes/index.js";
import { setupContainer } from "../di/container.js";
import { errorHandler } from "./middleware/global-error-handler.js";

// Initialize the DI container
setupContainer();

const server = fastify();

// Register global error handler
server.setErrorHandler(errorHandler);

server.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token"],
});

server.register(fastifyCookie);

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Linkhub v1 API",
      description: "Documentation of Linkhub v1",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token obtained from /auth/login endpoint",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  transform: jsonSchemaTransform,
});

server.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

server.register(database);
server.register(routes);

const startServer = async () => {
  try {
    await server.listen({ port: 3333 });
    console.log("Server listening on http://localhost:3333");
    console.log("Docs on http://localhost:3333/docs");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

export { server, startServer };
