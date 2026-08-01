/**
 * E2E tests for the personal-access-token (PAT) lifecycle and the
 * security-critical PAT auth + scope enforcement path.
 *
 * Runs against the DB-free Fastify app from `buildTestApp()` via app.inject().
 * The `apiAccessGuard` (PAT-aware) and `authGuard` (JWT-only, default-deny for
 * PATs) run for real, and PATs are minted through the real create-token route.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiTokenEntity } from "../../../../../core/entity/api-token/api-token-entity.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("API Tokens E2E — management with JWT", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authedUser() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, token };
  }

  it("mints a token that returns the one-time plaintext lh_pat_ value and no hash", async () => {
    const { token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Claude Code", scopes: ["posts:write"] }),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toMatch(/^lh_pat_[0-9a-f]{40}$/);
    expect(body.scopes).toEqual(["posts:write"]);
    // The response must never expose the stored hash.
    expect(body).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("lists the caller's own tokens without leaking the hash or plaintext", async () => {
    const { user, token } = await authedUser();

    const created = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "A", scopes: ["posts:read"] }),
    });
    const plaintext = created.json().token as string;

    // A token owned by another user must not appear in the list.
    const otherUser = await ctx.seedUser();
    await ctx.apiTokenRepository.create(
      ApiTokenEntity.create({
        userId: otherUser.id,
        name: "theirs",
        tokenHash: "other-hash",
        tokenPrefix: "lh_pat_other",
        scopes: ["posts:read"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/me/tokens",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const tokens = response.json();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe("A");
    const serialized = JSON.stringify(tokens);
    expect(serialized).not.toContain("tokenHash");
    // The plaintext is only ever returned at creation, never on listing.
    expect(serialized).not.toContain(plaintext);
    void user;
  });

  it("revokes the caller's own token (200)", async () => {
    const { token } = await authedUser();
    const created = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "revoke-me", scopes: ["posts:read"] }),
    });
    const tokenId = created.json().id as string;

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/me/tokens/${tokenId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    const stored = await ctx.apiTokenRepository.findById(tokenId);
    expect(stored?.revokedAt).not.toBeNull();
  });

  it("returns 403 when revoking a token owned by another user", async () => {
    const { token } = await authedUser();
    const otherUser = await ctx.seedUser();
    const foreignToken = ApiTokenEntity.create({
      userId: otherUser.id,
      name: "theirs",
      tokenHash: "foreign-hash",
      tokenPrefix: "lh_pat_foreign",
      scopes: ["posts:read"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
    await ctx.apiTokenRepository.create(foreignToken);

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/me/tokens/${foreignToken.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("PAT auth + scopes E2E (security-critical)", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  /** Mint a PAT via the real JWT-authenticated create route. */
  async function mintPat(scopes: string[]): Promise<{
    userId: string;
    pat: string;
    tokenId: string;
    jwt: string;
  }> {
    const user = await ctx.seedUser();
    const jwt = await ctx.signJwt(user.id);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ name: "pat", scopes }),
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    return { userId: user.id, pat: body.token, tokenId: body.id, jwt };
  }

  it("allows a PAT with posts:write to create a post AND keep a non-manual source (e.g. 'mcp')", async () => {
    const { userId, pat } = await mintPat(["posts:write"]);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ body: "posted by MCP", source: "mcp" }),
    });

    expect(response.statusCode).toBe(201);
    const post = response.json();
    // Unlike a JWT session, a PAT caller MAY set a non-manual provenance.
    expect(post.source).toBe("mcp");
    expect(post.userId).toBe(userId);
  });

  it("rejects a PAT with only posts:read on POST /me/posts (403)", async () => {
    const { pat } = await mintPat(["posts:read"]);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ body: "should be blocked" }),
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows a PAT with posts:read to list posts (read scope satisfied)", async () => {
    const { pat } = await mintPat(["posts:read"]);

    const response = await ctx.app.inject({
      method: "GET",
      url: "/me/posts",
      headers: { authorization: `Bearer ${pat}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it("default-denies a PAT presented to a plain authGuard route — POST /me/tokens (401)", async () => {
    const { pat } = await mintPat(["posts:write", "posts:read"]);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ name: "nope", scopes: ["posts:read"] }),
    });

    // authGuard only accepts real JWT sessions; a PAT is rejected outright.
    expect(response.statusCode).toBe(401);
  });

  it("rejects a revoked PAT with 401", async () => {
    const { pat, tokenId, jwt } = await mintPat(["posts:write"]);

    const revoke = await ctx.app.inject({
      method: "DELETE",
      url: `/me/tokens/${tokenId}`,
      headers: { authorization: `Bearer ${jwt}` },
    });
    expect(revoke.statusCode).toBe(200);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ body: "after revoke" }),
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an expired PAT with 401", async () => {
    const user = await ctx.seedUser();
    const generated = ctx.tokenProvider.generate();
    const expiredToken = ApiTokenEntity.create({
      userId: user.id,
      name: "expired",
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes: ["posts:write"],
      expiresAt: new Date(Date.now() - 60_000),
      lastUsedAt: null,
      revokedAt: null,
    });
    await ctx.apiTokenRepository.create(expiredToken);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${generated.token}` },
      body: JSON.stringify({ body: "should be blocked" }),
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an unknown lh_pat_ token with 401", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: {
        ...JSON_HEADERS,
        authorization: `Bearer lh_pat_${"0".repeat(40)}`,
      },
      body: JSON.stringify({ body: "no such token" }),
    });

    expect(response.statusCode).toBe(401);
  });
});
