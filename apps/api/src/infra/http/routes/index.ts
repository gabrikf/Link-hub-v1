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
import { agentPolicyRoutes } from "./agent-policy.js";
import { activityRoutes } from "./activity.js";
import { webhooksRoutes } from "./webhooks.js";
import { uploadsRoutes } from "./uploads.js";

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
  fastify.register(uploadsRoutes);
  fastify.register(agentPolicyRoutes);
  fastify.register(activityRoutes);

  /**
   * Registered ONCE, and intentionally left out of the `/api/v1` block below.
   *
   * Every other module is mounted twice so old and new clients can both reach
   * it, but a webhook URL is configured once in a forge and rotated by hand: a
   * second path serving the same handler is just a second endpoint accepting
   * signed deliveries that nobody remembers exists when the secret changes.
   */
  fastify.register(webhooksRoutes);

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
  fastify.register(uploadsRoutes, { prefix: "/api/v1" });
  fastify.register(agentPolicyRoutes, { prefix: "/api/v1" });
  fastify.register(activityRoutes, { prefix: "/api/v1" });
}
