/**
 * E2E tests for `POST /auth/refresh`.
 *
 * This endpoint did not exist while the web client was already shipping a
 * complete refresher against it (`apps/web/src/lib/unauthorized-interceptor.ts`):
 * it POSTs `{ refreshToken }` and parses `{ accessToken, refreshToken }`. Until
 * this landed it got a 404, latched "unsupported", and signed the user out on
 * the first access-token expiry — every 15 minutes, by JWT_EXPIRES_IN.
 *
 * So the request and response shapes here are not a matter of taste: they are
 * the contract the client already implements, asserted through @repo/schemas.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshSessionSchemaOutput } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("Auth refresh E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const post = (url: string, payload: Record<string, unknown>) =>
    ctx.app.inject({ method: "POST", url, headers: JSON_HEADERS, payload });

  /** Log in for real, so the refresh token under test was minted by the app. */
  async function signIn() {
    const user = await ctx.seedUser({
      email: "refresher@example.com",
      password: await ctx.hashProvider.hash("password123"),
    });

    const response = await post("/login", {
      email: "refresher@example.com",
      password: "password123",
    });

    expect(response.statusCode).toBe(200);

    return { user, tokens: response.json() };
  }

  it("exchanges a refresh token for a new pair", async () => {
    const { tokens } = await signIn();

    const response = await post("/refresh", {
      refreshToken: tokens.refreshToken,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(tokens.refreshToken);

    // Contract test against a REAL captured payload — the exact object
    // `refreshResponseSchema` in the web client parses.
    expect(() => refreshSessionSchemaOutput.parse(body)).not.toThrow();
  });

  it("issues an access token the API's own guard accepts", async () => {
    const { tokens } = await signIn();

    const refreshed = await post("/refresh", {
      refreshToken: tokens.refreshToken,
    });

    // A refresh that returns a token no guard honours is worse than no refresh
    // at all: the client would think the session was renewed and every
    // subsequent request would still 401.
    const authed = await ctx.app.inject({
      method: "GET",
      url: "/preferences",
      headers: { authorization: `Bearer ${refreshed.json().accessToken}` },
    });

    expect(authed.statusCode).toBe(200);
  });

  it("refuses a REUSED refresh token", async () => {
    const { tokens } = await signIn();

    await post("/refresh", { refreshToken: tokens.refreshToken });
    const replay = await post("/refresh", {
      refreshToken: tokens.refreshToken,
    });

    // Rotation: the presented token is destroyed on use, so a copy lifted from
    // localStorage buys one refresh at most.
    expect(replay.statusCode).toBe(401);
  });

  it("keeps working across successive refreshes", async () => {
    const { tokens } = await signIn();

    let current = tokens.refreshToken;

    for (let round = 0; round < 3; round += 1) {
      const response = await post("/refresh", { refreshToken: current });
      expect(response.statusCode).toBe(200);
      current = response.json().refreshToken;
    }

    // Exactly one live refresh token per session, never a growing pile.
    expect(ctx.refreshTokenRepository.count()).toBe(1);
  });

  it("refuses an unknown refresh token with 401", async () => {
    const response = await post("/refresh", { refreshToken: "never-issued" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an empty refresh token at the schema", async () => {
    const response = await post("/refresh", { refreshToken: "" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("answers on /api/v1/auth/refresh too", async () => {
    const { tokens } = await signIn();

    // The client builds its URL from whatever base it was configured with, so
    // a dual mount that only half works is a 404 for half the deployments.
    const response = await post("/api/v1/refresh", {
      refreshToken: tokens.refreshToken,
    });

    expect(response.statusCode).toBe(200);
  });
});
