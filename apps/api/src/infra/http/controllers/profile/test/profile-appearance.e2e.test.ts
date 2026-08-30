/**
 * E2E for banner / background placement, over the wire.
 *
 * The unit tests around `UpdateProfileUseCase` cover the rule. What they cannot
 * cover is the failure this app has actually had before: a Fastify response
 * schema serialises ONLY what it declares, so a field added to the use case but
 * missing from `updateProfileSchemaOutput` / `profileSchema` comes back
 * `undefined` from a 200 that looks perfectly healthy — and a banner silently
 * re-centres itself on the next page load.
 *
 * Runs against the DB-free app from `buildTestApp()`.
 */
import {
  DEFAULT_PROFILE_APPEARANCE,
  profileSchema,
  updateProfileSchemaOutput,
} from "@repo/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const APPEARANCE = {
  bannerPlacement: { x: 50, y: 18, scale: 1.2 },
  backgroundPlacement: { x: 25, y: 70, scale: 1 },
  backgroundOverlay: 30,
  backgroundBlur: 12,
};

describe("PUT /profile — where the banner and the background sit", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authed() {
    const user = await ctx.seedUser({ login: "mariana" });
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

  it("stores the placement and hands it back on /me and the public profile", async () => {
    const { auth } = await authed();

    const saved = await save(auth, {
      username: "mariana",
      bannerImageUrl: "https://cdn.crafthub.dev/b/pilates.jpg",
      backgroundImageUrl: "https://cdn.crafthub.dev/bg/studio.jpg",
      appearance: APPEARANCE,
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().appearance).toEqual(APPEARANCE);
    expect(() => updateProfileSchemaOutput.parse(saved.json())).not.toThrow();

    const me = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: auth,
    });
    expect(me.json().appearance).toEqual(APPEARANCE);

    // The public payload is what a visitor's browser renders the cover from.
    const publicProfile = await ctx.app.inject({
      method: "GET",
      url: "/profile/mariana",
    });
    const payload = publicProfile.json();
    expect(payload.appearance).toEqual(APPEARANCE);
    expect(() => profileSchema.parse(payload)).not.toThrow();
  });

  it("gives an account that never opened the panel the documented default", async () => {
    const { auth } = await authed();

    const me = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: auth,
    });

    expect(me.json().appearance).toEqual(DEFAULT_PROFILE_APPEARANCE);
  });

  it("leaves a stored placement alone when a save omits it", async () => {
    const { auth } = await authed();
    await save(auth, { username: "mariana", appearance: APPEARANCE });

    // A save from any screen that does not own the appearance fields.
    const later = await save(auth, {
      username: "mariana",
      name: "Mariana M. Freitas",
    });

    expect(later.json().appearance).toEqual(APPEARANCE);
  });

  it("rejects an out-of-range placement with a 400", async () => {
    const { auth } = await authed();

    const response = await save(auth, {
      username: "mariana",
      appearance: {
        ...APPEARANCE,
        bannerPlacement: { x: 50, y: 50, scale: 40 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a partial appearance rather than guessing the missing halves", async () => {
    const { auth } = await authed();

    const response = await save(auth, {
      username: "mariana",
      appearance: { backgroundOverlay: 10 },
    });

    expect(response.statusCode).toBe(400);
  });
});
