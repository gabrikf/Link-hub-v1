import { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getRedis } from "../../redis/redis-client.js";
import { authRoutes } from "./auth.js";
import { linksRoutes } from "./links.js";
import { postsRoutes } from "./posts.js";
import { apiTokensRoutes } from "./api-tokens.js";
import { profileLayoutRoutes } from "./profile-layout.js";
import { profileRoutes } from "./profile.js";
import { preferencesRoutes } from "./preferences.js";
import { resumeRoutes } from "./resume.js";
import { interactionsRoutes } from "./interactions.js";
import { workExperienceRoutes } from "./work-experience.js";
import { aiImportRoutes } from "./ai-import.js";
import { agentPolicyRoutes } from "./agent-policy.js";
import { activityRoutes } from "./activity.js";
import { webhooksRoutes } from "./webhooks.js";
import { uploadsRoutes } from "./uploads.js";

export async function routes(fastify: FastifyInstance) {
  /**
   * Liveness. Answers from the process alone and cannot fail while the event
   * loop is turning. The Docker HEALTHCHECK and the deploy's rollback check
   * both read this exact body, so it must never learn to depend on Postgres —
   * a database blip would otherwise roll back a perfectly good release.
   */
  fastify.get("/health", async (request, reply) => {
    reply.send({ status: "ok" });
  });

  /**
   * Readiness. The counterpart that *is* allowed to fail: it answers "can this
   * process actually serve traffic", which is the question a load balancer and
   * a post-deploy smoke check want. Kept separate from /health precisely
   * because the answers differ.
   */
  fastify.get("/health/ready", async (request, reply) => {
    const checks: { database: string; redis: string } = {
      database: "ok",
      redis: "ok",
    };

    try {
      await fastify.db.execute(sql`select 1`);
    } catch {
      checks.database = "error";
    }

    try {
      await getRedis().ping();
    } catch {
      // Distinguished from the database's "error" because Redis backs
      // degrade-open features (rate limit store, quotas, DAU) — knowing it is
      // the one that is down changes what you go and look at.
      checks.redis = "unavailable";
    }

    const ready = checks.database === "ok" && checks.redis === "ok";

    reply.status(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      checks,
    });
  });

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(linksRoutes);
  fastify.register(postsRoutes);
  fastify.register(apiTokensRoutes);
  fastify.register(profileLayoutRoutes);
  fastify.register(profileRoutes);
  fastify.register(preferencesRoutes);
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
  fastify.register(preferencesRoutes, { prefix: "/api/v1" });
  fastify.register(resumeRoutes, { prefix: "/api/v1" });
  fastify.register(interactionsRoutes, { prefix: "/api/v1" });
  fastify.register(workExperienceRoutes, { prefix: "/api/v1" });
  fastify.register(aiImportRoutes, { prefix: "/api/v1" });
  fastify.register(uploadsRoutes, { prefix: "/api/v1" });
  fastify.register(agentPolicyRoutes, { prefix: "/api/v1" });
  fastify.register(activityRoutes, { prefix: "/api/v1" });
}
