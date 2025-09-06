import fastify from "fastify";
import database from "./pluguins/database.js";
import fastifyCors from "@fastify/cors";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { routes } from "./routes/index.js";

const server = fastify();

server.register(fastifyCors, {
  origin: "*",
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifySwagger, {
  openapi: {
    info: {
      title: "API de Ifound",
      description: "Documentação da API de Ifound",
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
    await server.listen({ port: 3000 });
    console.log("Server listening on http://localhost:3000");
    console.log("Docs on http://localhost:3000/docs");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

export { server, startServer };
