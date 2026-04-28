import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { linksRoutes } from "./links.js";
import { profileRoutes } from "./profile.js";
import { resumeRoutes } from "./resume.js";
import { interactionsRoutes } from "./interactions.js";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async (request, reply) => {
    reply.send({ status: "ok" });
  });

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(linksRoutes);
  fastify.register(profileRoutes);
  fastify.register(resumeRoutes);
  fastify.register(interactionsRoutes);

  fastify.register(authRoutes, { prefix: "/api/v1/auth" });
  fastify.register(linksRoutes, { prefix: "/api/v1" });
  fastify.register(profileRoutes, { prefix: "/api/v1" });
  fastify.register(resumeRoutes, { prefix: "/api/v1" });
  fastify.register(interactionsRoutes, { prefix: "/api/v1" });
}
