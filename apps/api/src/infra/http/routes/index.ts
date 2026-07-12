import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { linksRoutes } from "./links.js";
import { postsRoutes } from "./posts.js";
import { apiTokensRoutes } from "./api-tokens.js";
import { profileLayoutRoutes } from "./profile-layout.js";
import { profileRoutes } from "./profile.js";
import { resumeRoutes } from "./resume.js";
import { interactionsRoutes } from "./interactions.js";
import { workExperienceRoutes } from "./work-experience.js";
import { aiImportRoutes } from "./ai-import.js";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async (request, reply) => {
    reply.send({ status: "ok" });
  });

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(linksRoutes);
  fastify.register(postsRoutes);
  fastify.register(apiTokensRoutes);
  fastify.register(profileLayoutRoutes);
  fastify.register(profileRoutes);
  fastify.register(resumeRoutes);
  fastify.register(interactionsRoutes);
  fastify.register(workExperienceRoutes);
  fastify.register(aiImportRoutes);

  fastify.register(authRoutes, { prefix: "/api/v1/auth" });
  fastify.register(linksRoutes, { prefix: "/api/v1" });
  fastify.register(postsRoutes, { prefix: "/api/v1" });
  fastify.register(apiTokensRoutes, { prefix: "/api/v1" });
  fastify.register(profileLayoutRoutes, { prefix: "/api/v1" });
  fastify.register(profileRoutes, { prefix: "/api/v1" });
  fastify.register(resumeRoutes, { prefix: "/api/v1" });
  fastify.register(interactionsRoutes, { prefix: "/api/v1" });
  fastify.register(workExperienceRoutes, { prefix: "/api/v1" });
  fastify.register(aiImportRoutes, { prefix: "/api/v1" });
}
