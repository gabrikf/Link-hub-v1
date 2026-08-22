import "reflect-metadata";
import fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from "fastify";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BadRequestError,
  InternalServerError,
} from "../../../core/errors/index.js";
import { InMemoryAiQuotaProvider } from "../../../core/providers/ai-quota/in-memory-ai-quota-provider.js";
import { TOKENS } from "../../di/container.js";
import { errorHandler } from "./global-error-handler.js";
import { aiQuotaGuard } from "./ai-quota-guard.js";

/**
 * A focused app rather than `build-test-app.ts`: that harness registers only
 * the Posts/ApiTokens/AgentPolicy/WorkExperience/Activity controllers, so it
 * cannot reach either guarded route, and widening it would mean editing a file
 * the whole http layer's tests share.
 *
 * The app below is the guard plus the REAL global error handler, because half
 * of what is being pinned here is how the 429 body compares to the one every
 * other error produces.
 */

const ENV_KEYS = [
  "AI_QUOTA_ENABLED",
  "AI_QUOTA_RESUME_PARSE_DAILY",
  "NODE_ENV",
] as const;

let savedEnv: Record<string, string | undefined> = {};
let quota: InMemoryAiQuotaProvider;
let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const instance = fastify();

  instance.setErrorHandler(errorHandler);

  // Stands in for authGuard: the quota guard always runs behind one, and what
  // matters to it is only that `request.user.id` is populated.
  const authenticate = async (request: FastifyRequest) => {
    const userId = request.headers["x-user-id"];
    if (typeof userId === "string") {
      request.user = { id: userId };
    }
  };

  instance.post(
    "/guarded",
    { preHandler: [authenticate, aiQuotaGuard("resume_parse")] },
    async () => ({ ok: true }),
  );

  instance.post(
    "/guarded-bad-request",
    { preHandler: [authenticate, aiQuotaGuard("resume_parse")] },
    async () => {
      throw new BadRequestError("Provide a resume with enough content.");
    },
  );

  instance.post(
    "/guarded-boom",
    { preHandler: [authenticate, aiQuotaGuard("resume_parse")] },
    async () => {
      throw new InternalServerError("upstream exploded");
    },
  );

  // No auth in front of this one — the guard must not meter anonymous traffic.
  instance.post("/guarded-anonymous", { preHandler: [aiQuotaGuard("resume_parse")] }, async () => ({
    ok: true,
  }));

  await instance.ready();
  return instance;
}

/** The refund rides the response's "finish" event, one tick after inject(). */
const settle = () => new Promise((done) => setImmediate(done));

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  process.env.AI_QUOTA_ENABLED = "true";
  process.env.AI_QUOTA_RESUME_PARSE_DAILY = "2";

  container.reset();
  quota = new InMemoryAiQuotaProvider();
  container.registerInstance(TOKENS.AiQuotaProvider, quota);

  app = await buildApp();
});

afterEach(async () => {
  await app.close();

  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("aiQuotaGuard — disabled (the development default)", () => {
  it("does nothing at all when the quota is off", async () => {
    delete process.env.AI_QUOTA_ENABLED;
    process.env.NODE_ENV = "development";

    // Nothing registered under the token: if the guard resolved the provider
    // anyway this would throw, which is the point — locally the guard must not
    // even reach the container.
    container.reset();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/guarded",
        headers: { "x-user-id": "user-1" },
      });

      expect(response.statusCode).toBe(200);
    }
  });
});

describe("aiQuotaGuard — under the limit", () => {
  it("lets the request through and charges one unit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(quota.usedToday("user-1", "resume_parse")).toBe(1);
  });

  it("meters each user separately", async () => {
    await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });
    await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });

    const otherUser = await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-2" },
    });

    expect(otherUser.statusCode).toBe(200);
  });
});

describe("aiQuotaGuard — at the limit", () => {
  async function exhaust(userId = "user-1") {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await app.inject({
        method: "POST",
        url: "/guarded",
        headers: { "x-user-id": userId },
      });
    }
  }

  it("replies 429 with a message naming the limit and the reset time", async () => {
    await exhaust();

    const response = await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });

    expect(response.statusCode).toBe(429);

    const body = response.json();

    expect(body.message).toContain("daily limit of 2 resume parses");
    expect(body.message).toContain(body.resetAt.replace(/\.\d{3}Z$/, "Z"));
    expect(body.limit).toBe(2);
    expect(body.remaining).toBe(0);
    expect(new Date(body.resetAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps the error body shape the global handler produces", async () => {
    await exhaust();

    const body = (
      await app.inject({
        method: "POST",
        url: "/guarded",
        headers: { "x-user-id": "user-1" },
      })
    ).json();

    expect(body).toMatchObject({
      error: "TOO_MANY_REQUESTS",
      code: "TOO_MANY_REQUESTS",
      statusCode: 429,
      path: "/guarded",
    });
    expect(typeof body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("sets Retry-After to the seconds left until the reset", async () => {
    await exhaust();

    const response = await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });

    const retryAfter = Number(response.headers["retry-after"]);

    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("never reaches the handler once the budget is gone", async () => {
    await exhaust();

    // A third call must not have run the route body — the whole point is that
    // OpenAI is never touched.
    const response = await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });

    expect(response.json().ok).toBeUndefined();
  });
});

describe("aiQuotaGuard — refunds", () => {
  it("refunds a unit when the request fails with a 4xx", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/guarded-bad-request",
      headers: { "x-user-id": "user-1" },
    });
    await settle();

    expect(response.statusCode).toBe(400);
    // A malformed body must not cost the user part of their daily budget.
    expect(quota.usedToday("user-1", "resume_parse")).toBe(0);
  });

  it("does NOT refund on a 5xx", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/guarded-boom",
      headers: { "x-user-id": "user-1" },
    });
    await settle();

    expect(response.statusCode).toBe(500);
    // The failure may well have happened after OpenAI was already paid.
    expect(quota.usedToday("user-1", "resume_parse")).toBe(1);
  });

  it("does NOT refund its own 429", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await app.inject({
        method: "POST",
        url: "/guarded",
        headers: { "x-user-id": "user-1" },
      });
    }

    await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });
    await settle();

    // A refund here would decrement the very counter doing the rejecting and
    // hand the caller an endless supply of retries.
    expect(quota.usedToday("user-1", "resume_parse")).toBe(3);
  });

  it("keeps the unit on success", async () => {
    await app.inject({
      method: "POST",
      url: "/guarded",
      headers: { "x-user-id": "user-1" },
    });
    await settle();

    expect(quota.usedToday("user-1", "resume_parse")).toBe(1);
  });
});

describe("aiQuotaGuard — no authenticated user", () => {
  it("rejects with 401 rather than metering everyone as one bucket", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/guarded-anonymous",
    });

    expect(response.statusCode).toBe(401);
  });
});
