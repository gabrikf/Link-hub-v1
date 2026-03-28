import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async (request, reply) => {
    reply.send({ status: "ok" });
  });

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(authRoutes, { prefix: "/api/v1/auth" });
}
