/**
 * E2E for the free-text role label, over the wire.
 *
 * The unit tests around `UpdateProfileUseCase` already cover the rule. What
 * they cannot cover is the part that has silently dropped fields before: a
 * Fastify response schema serialises ONLY what it declares, so a field added to
 * the use case but not to `updateProfileSchemaOutput` / `profileSchema` comes
 * back `undefined` from a 200 that looks perfectly healthy. These assert on the
 * real payloads instead.
 *
 * Runs against the DB-free app from `buildTestApp()`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileSchema } from "@repo/schemas";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("PUT /profile — a role the persona enum does not cover", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authed() {
    const user = await ctx.seedUser({ login: "ana" });
    const token = await ctx.signJwt(user.id);
    return { user, auth: { authorization: `Bearer ${token}` } };
  }

  const save = (auth: Record<string, string>, body: unknown) =>
    ctx.app.inject({
      method: "PUT",
      url: "/profile",
      headers: { ...JSON_HEADERS, ...auth },
      body: JSON.stringify(body),
    });

  it("stores the custom label and hands it back on /me and the public profile", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "ana",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    const me = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: auth,
    });
    expect(me.json()).toMatchObject({ personaOther: "Fisioterapeuta" });

    // The public payload is the one a stranger sees, and it is what the banner
    // chip renders from.
    const publicProfile = await ctx.app.inject({
      method: "GET",
      url: "/profile/ana",
    });
    const payload = publicProfile.json();
    expect(payload.personaOther).toBe("Fisioterapeuta");
    // …and it still is exactly what the shared contract describes.
    expect(() => profileSchema.parse(payload)).not.toThrow();
  });

  it("trims the label rather than storing the user's stray spaces", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "ana",
      persona: "other",
      personaOther: "  Fisioterapeuta  ",
    });

    expect(saved.json().personaOther).toBe("Fisioterapeuta");
  });

  it("rejects a blank label instead of publishing an empty chip", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "ana",
      persona: "other",
      personaOther: "   ",
    });

    expect(saved.statusCode).toBe(400);
  });

  it("rejects a label past the 60-character bound", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "ana",
      persona: "other",
      personaOther: "x".repeat(61),
    });

    expect(saved.statusCode).toBe(400);
  });

  it("keeps persona a closed enum — free text is not a persona", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "ana",
      persona: "fisioterapeuta",
    });

    expect(saved.statusCode).toBe(400);
  });

  it("drops a stale label when the user picks a named role", async () => {
    const { auth } = await authed();

    await save(auth, {
      username: "ana",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    const switched = await save(auth, {
      username: "ana",
      persona: "developer",
    });

    expect(switched.json()).toMatchObject({
      persona: "developer",
      personaOther: null,
    });

    const publicProfile = await ctx.app.inject({
      method: "GET",
      url: "/profile/ana",
    });
    expect(publicProfile.json().personaOther).toBeNull();
  });

  it("reports no label on an account that never set one", async () => {
    const { auth } = await authed();

    const me = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: auth,
    });

    expect(me.json().personaOther).toBeNull();
  });
});
