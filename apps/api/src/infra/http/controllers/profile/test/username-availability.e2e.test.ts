/**
 * The availability check, over the wire.
 *
 * The use-case test proves the rules; this proves the ROUTE — that the query
 * string is validated by the shared schema, that the response matches the
 * contract the browser parses, that no session is required, and that a session
 * (when present) is what stops a person being told their own handle is taken.
 *
 * Hermetic: `buildTestApp()` — in-memory repositories, real zod validation,
 * real error handler. No database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usernameAvailabilitySchema } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

describe("GET /username-available", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const check = (username: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({
      method: "GET",
      url: `/username-available?username=${encodeURIComponent(username)}`,
      headers,
    });

  it("answers a free handle to an anonymous caller", async () => {
    const response = await check("mariana");

    expect(response.statusCode).toBe(200);
    // Parsed through the SHARED schema: this is the payload the browser will
    // hand to `usernameAvailabilitySchema.parse`, so a drift here is a failing
    // test rather than a runtime break in the form.
    expect(usernameAvailabilitySchema.parse(response.json())).toEqual({
      username: "mariana",
      isAvailable: true,
      reason: null,
    });
  });

  it("reports a handle another account holds as taken", async () => {
    await ctx.seedUser({ login: "mariana" });

    expect(usernameAvailabilitySchema.parse((await check("mariana")).json()))
      .toEqual({ username: "mariana", isAvailable: false, reason: "taken" });
  });

  it("reports a reserved handle with its own reason", async () => {
    expect(usernameAvailabilitySchema.parse((await check("dashboard")).json()))
      .toEqual({ username: "dashboard", isAvailable: false, reason: "reserved" });
  });

  it("tells the owner their own handle is available to them", async () => {
    const owner = await ctx.seedUser({ login: "mariana" });
    const token = await ctx.signJwt(owner.id);

    const response = await check("mariana", {
      authorization: `Bearer ${token}`,
    });

    expect(response.json()).toMatchObject({ isAvailable: true, reason: null });
  });

  /**
   * A stale or forged token must not turn into a 401 here — the route answers
   * anonymous callers, and refusing one because their session happens to have
   * expired would break the register form for nobody's benefit.
   */
  it("falls back to the anonymous answer when the token is unusable", async () => {
    await ctx.seedUser({ login: "mariana" });

    const response = await check("mariana", {
      authorization: "Bearer not-a-real-token",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ isAvailable: false, reason: "taken" });
  });

  /**
   * THE CHECK AND THE SAVE MUST AGREE, including about whitespace.
   *
   * The browser asks about the trimmed value — it is what the person can see
   * themselves typing — so a save that stored the untrimmed one would answer
   * "ada is available" and then create the handle `" ada "`, whose profile
   * lives at `/%20ada%20` and which nobody would ever find. The trim is on the
   * shared schema, so every client inherits it rather than each remembering.
   */
  it("stores the same handle the check was asked about, whitespace and all", async () => {
    const owner = await ctx.seedUser({ login: "mariana" });
    const token = await ctx.signJwt(owner.id);

    expect((await check(" ada ")).json()).toMatchObject({
      username: "ada",
      isAvailable: true,
    });

    const saved = await ctx.app.inject({
      method: "PUT",
      url: "/profile",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username: " ada " }),
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ username: "ada" });
    // And the profile is reachable at the handle the check named.
    expect((await ctx.app.inject({ method: "GET", url: "/profile/ada" })).statusCode).toBe(200);
  });

  it("rejects a call with no username at all", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/username-available",
    });

    expect(response.statusCode).toBe(400);
  });
});
