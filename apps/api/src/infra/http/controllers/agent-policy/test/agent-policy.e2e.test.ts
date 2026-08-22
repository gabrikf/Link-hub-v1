/**
 * E2E tests for the agent disclosure policy.
 *
 * The point of these is the asymmetry the feature depends on: a PAT may READ
 * the policy and the redacted work context, but only a real session may CHANGE
 * them — and a PAT that names an employer at summary level is rejected by the
 * API, not merely discouraged by a tool description.
 *
 * Runs against the DB-free app from `buildTestApp()`; guards, zod validation
 * and the global error handler all run for real.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkExperienceEntity } from "../../../../../core/entity/work-experience/work-experience-entity.js";
import type { UserEntity } from "../../../../../core/entity/user/user-entity.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("Agent policy E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authedUser(
    overrides: {
      agentDisclosureLevel?: "summary" | "detailed" | "full";
      agentBlockedTerms?: string[];
    } = {},
  ) {
    const user = await ctx.seedUser(overrides);
    const token = await ctx.signJwt(user.id);
    return { user, token };
  }

  /** Mints a real PAT through the real create-token route. */
  async function mintPat(
    jwt: string,
    scopes: string[] = ["posts:read", "posts:write", "profile:read"],
  ) {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: "agent", scopes }),
    });
    return response.json().token as string;
  }

  async function seedRole(
    user: UserEntity,
    companyName: string,
    disclosureLevel: "summary" | "detailed" | "full" | null = null,
    overrides: { description?: string | null; displayOrder?: number } = {},
  ) {
    return ctx.workExperienceRepository.create(
      WorkExperienceEntity.create({
        userId: user.id,
        title: "Senior Software Engineer",
        companyName,
        employmentType: "full-time",
        workModel: "remote",
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: "2022-01-01",
        endDate: "2024-01-01",
        isCurrent: false,
        description: overrides.description ?? null,
        mainStack: ["TypeScript", "Fastify"],
        disclosureLevel,
        displayOrder: overrides.displayOrder ?? 0,
      }),
    );
  }

  describe("GET /me/agent-policy", () => {
    it("returns the strictest level by default", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        disclosureLevel: "summary",
        blockedTerms: [],
        perEmployer: [],
      });
    });

    it("is readable by a PAT carrying profile:read", async () => {
      const { token } = await authedUser();
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
        headers: { authorization: `Bearer ${pat}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 403 for a PAT missing the profile:read scope", async () => {
      const { token } = await authedUser();
      const pat = await mintPat(token, ["posts:read", "posts:write"]);

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
        headers: { authorization: `Bearer ${pat}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain("profile:read");
    });

    it("returns 401 without an Authorization header", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
      });
      expect(response.statusCode).toBe(401);
    });

    it("lists only the roles that override the account default", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp", "full", { displayOrder: 0 });
      await seedRole(user, "Nubank", null, { displayOrder: 1 });

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
        headers: { authorization: `Bearer ${token}` },
      });

      const perEmployer = response.json().perEmployer;
      expect(perEmployer).toHaveLength(1);
      expect(perEmployer[0].companyName).toBe("Acme Corp");
      expect(perEmployer[0].disclosureLevel).toBe("full");
    });
  });

  describe("PATCH /me/agent-policy", () => {
    it("updates the level and blocked terms for a real session", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/agent-policy",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          disclosureLevel: "detailed",
          blockedTerms: ["Project Falcon"],
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().disclosureLevel).toBe("detailed");
      expect(response.json().blockedTerms).toEqual(["Project Falcon"]);
    });

    it("REFUSES a PAT outright — an agent must never widen its own policy", async () => {
      const { token } = await authedUser();
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/agent-policy",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({ disclosureLevel: "full" }),
      });

      // authGuard rejects the PAT as an unverifiable JWT.
      expect(response.statusCode).toBe(401);

      // And the policy is untouched.
      const after = await ctx.app.inject({
        method: "GET",
        url: "/me/agent-policy",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.json().disclosureLevel).toBe("summary");
    });

    it("rejects an unknown disclosure level with 400", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/agent-policy",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ disclosureLevel: "everything" }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects more than 50 blocked terms with 400", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/agent-policy",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          blockedTerms: Array.from({ length: 51 }, (_, i) => `term-${i}`),
        }),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /me/work-context", () => {
    it("returns roles with the employer stripped at summary level", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp", null, {
        description: "Rebuilt checkout for Acme Corp using TDD.",
      });
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/work-context",
        headers: { authorization: `Bearer ${pat}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.disclosureLevel).toBe("summary");
      expect(body.roles[0].companyName).toBeNull();
      expect(body.roles[0].achievements[0]).not.toContain("Acme Corp");
      // The employer name must not survive anywhere in the payload.
      expect(JSON.stringify(body)).not.toContain("Acme Corp");
    });

    it("keeps the safe signal — stack, practices, seniority, duration", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp", null, {
        description: "Practised TDD and CI/CD on the payments platform.",
      });

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/work-context",
        headers: { authorization: `Bearer ${token}` },
      });

      const role = response.json().roles[0];
      expect(role.stack).toEqual(["TypeScript", "Fastify"]);
      expect(role.practices).toEqual(expect.arrayContaining(["TDD", "CI/CD"]));
      expect(role.domain).toBe("payments");
      expect(role.seniorityHint).toBe("senior");
      expect(role.durationMonths).toBe(24);
    });

    it("includes the employer once the user raises the level to detailed", async () => {
      const { user, token } = await authedUser({
        agentDisclosureLevel: "detailed",
      });
      await seedRole(user, "Acme Corp");

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/work-context",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.json().roles[0].companyName).toBe("Acme Corp");
    });

    it("returns 403 for a PAT missing profile:read", async () => {
      const { token } = await authedUser();
      const pat = await mintPat(token, ["posts:read"]);

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/work-context",
        headers: { authorization: `Bearer ${pat}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("PATCH /me/work-experiences/:id/disclosure", () => {
    it("sets and then clears a per-employer override", async () => {
      const { user, token } = await authedUser();
      const role = await seedRole(user, "Acme Corp");

      const set = await ctx.app.inject({
        method: "PATCH",
        url: `/me/work-experiences/${role.id}/disclosure`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ disclosureLevel: "detailed" }),
      });
      expect(set.statusCode).toBe(200);
      expect(set.json().disclosureLevel).toBe("detailed");

      const cleared = await ctx.app.inject({
        method: "PATCH",
        url: `/me/work-experiences/${role.id}/disclosure`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ disclosureLevel: null }),
      });
      expect(cleared.json().disclosureLevel).toBeNull();
    });

    it("returns 403 for someone else's role", async () => {
      const { token } = await authedUser();
      const stranger = await ctx.seedUser();
      const role = await seedRole(stranger, "Not Yours");

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/work-experiences/${role.id}/disclosure`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ disclosureLevel: "full" }),
      });

      expect(response.statusCode).toBe(403);
    });

    it("refuses a PAT — a privacy control is a human decision", async () => {
      const { user, token } = await authedUser();
      const role = await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/work-experiences/${role.id}/disclosure`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({ disclosureLevel: "full" }),
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("Write-side enforcement on POST /me/posts", () => {
    it("rejects an agent post naming the employer with 400 and an actionable message", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "Shipped a new checkout flow at Acme Corp this week.",
        }),
      });

      expect(response.statusCode).toBe(400);
      const message = response.json().message as string;
      expect(message).toContain("Acme Corp");
      expect(message).toContain("summary");
    });

    it("accepts the same post from the human's own session", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp");

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          body: "Shipped a new checkout flow at Acme Corp this week.",
        }),
      });

      expect(response.statusCode).toBe(201);
    });

    it("accepts an agent post that describes the work without naming the employer", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "Shipped a checkout flow. TypeScript, Fastify, PostgreSQL.",
          tags: ["typescript", "fastify"],
        }),
      });

      expect(response.statusCode).toBe(201);
    });

    it("lets the agent name the employer once the user raises the level", async () => {
      const { user, token } = await authedUser({
        agentDisclosureLevel: "detailed",
      });
      await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "Shipped a checkout flow at Acme Corp.",
        }),
      });

      expect(response.statusCode).toBe(201);
    });

    it("persists workExperienceId so the post inherits that role's level", async () => {
      const { user, token } = await authedUser();
      const role = await seedRole(user, "Open Source Co", "detailed");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "Cut a release at Open Source Co.",
          workExperienceId: role.id,
        }),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().workExperienceId).toBe(role.id);
    });

    it("rejects a post attributed to a full role that names a summary employer", async () => {
      // The whole point of a per-role level: raising ONE role says "you may
      // name THIS employer", never "you may name all of them".
      const { user, token } = await authedUser();
      const open = await seedRole(user, "Open Source Co", "full");
      await seedRole(user, "Acme Corp", null, { displayOrder: 1 });
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "Cut a release at Acme Corp this week.",
          workExperienceId: open.id,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message as string).toContain("Acme Corp");
    });

    it("rejects an agent post that names the employer only in externalUrl", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Nubank");
      const pat = await mintPat(token);

      // The link is rendered as the post's <a href> on the public profile, so
      // it reaches the same anonymous reader the body does.
      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          title: "Shipped a ledger reconciliation job",
          body: "Cut p99 from 900ms to 120ms. TypeScript, Fastify, PostgreSQL.",
          tags: ["typescript"],
          externalUrl: "https://github.com/nubank-internal/ledger/pull/4471",
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Nubank");
    });

    it("rejects an agent post that names the employer only in an image URL", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Nubank");
      const pat = await mintPat(token);

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          source: "mcp",
          body: "A clean body.",
          coverImageUrl: "https://cdn.example.com/nubank/architecture.png",
          images: ["https://cdn.example.com/nubank/diagram.png"],
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Nubank");
    });

    it("blocks an agent PATCH that introduces the employer via externalUrl", async () => {
      const { user, token } = await authedUser();
      await seedRole(user, "Nubank");
      const pat = await mintPat(token);

      // Manual post for the same reason as the test below: a machine-authored
      // post refuses a PAT's externalUrl outright, which would short-circuit
      // the disclosure check this test is about.
      const created = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: "A clean post." }),
      });
      const postId = created.json().id as string;

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/posts/${postId}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({
          externalUrl: "https://github.com/nubank-internal/ledger/pull/4471",
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Nubank");
    });

    it("blocks an agent PATCH that introduces a blocked term", async () => {
      const { user, token } = await authedUser({
        agentBlockedTerms: ["Project Falcon"],
      });
      await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      // The post the agent edits has to be one the HUMAN wrote (source
      // 'manual'): a machine-authored post refuses every content patch
      // outright, which would short-circuit the disclosure check this test is
      // about. Covered separately below.
      const created = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: "A clean post." }),
      });
      const postId = created.json().id as string;

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/posts/${postId}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({ body: "Actually it was Project Falcon." }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Project Falcon");
    });

    it("refuses an agent PATCH of its OWN post's content, before disclosure even runs", async () => {
      const { user, token } = await authedUser({
        agentBlockedTerms: ["Project Falcon"],
      });
      await seedRole(user, "Acme Corp");
      const pat = await mintPat(token);

      const created = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({ source: "mcp", body: "A clean post." }),
      });
      const postId = created.json().id as string;

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/posts/${postId}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
        body: JSON.stringify({ body: "A harmless-looking rewrite." }),
      });

      // 403, not 400: an mcp-authored post is immutable regardless of what the
      // new text says. Provenance is checked before content.
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain("immutable");
    });
  });
});
