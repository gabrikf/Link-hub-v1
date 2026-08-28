/**
 * E2E tests for the two profile-payload guarantees this change introduces:
 *
 *  1. `tabsEnabled` really travels — through `PUT /profile`, back out of `/me`
 *     and out of the fully public `/profile/:username`, which is the only place
 *     the public renderer can learn whether to draw the tab strip.
 *  2. The private preferences do NOT travel. `profileSchema` feeds both `/me`
 *     and an anonymous `/profile/:username`, so the day someone adds `language`
 *     and `theme` next to `themePreset` a person's UI settings become public.
 *     That is asserted here on a real payload rather than trusted to review.
 *
 * Runs against the DB-free app from `buildTestApp()`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileSchema } from "@repo/schemas";
import { ProfileBlockEntity } from "../../../../../core/entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../../../../core/entity/profile-tab/profile-tab-entity.js";
import type { UserEntity } from "../../../../../core/entity/user/user-entity.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("Profile payload: tabsEnabled and preference privacy", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authed() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, auth: { authorization: `Bearer ${token}` } };
  }

  /** Three tabs on `pc` with one block each, plus a block pinned to all tabs. */
  async function seedLayout(user: UserEntity) {
    const tabs = await Promise.all(
      ["Work", "Writing", "Contact"].map((title, order) =>
        ctx.profileTabsRepository.create(
          ProfileTabEntity.create({
            userId: user.id,
            viewport: "pc",
            title,
            order,
          }),
        ),
      ),
    );

    for (const [index, tab] of tabs.entries()) {
      await ctx.profileBlocksRepository.create(
        ProfileBlockEntity.create({
          userId: user.id,
          viewport: "pc",
          tabId: tab.id,
          kind: "links",
          gridX: 0,
          gridY: index,
          gridW: 4,
          gridH: 2,
        }),
      );
    }

    // Pinned: tabId null, visible on every tab. The one most at risk from a
    // "tabs off" implementation that filters by the first tab's id.
    await ctx.profileBlocksRepository.create(
      ProfileBlockEntity.create({
        userId: user.id,
        viewport: "pc",
        tabId: null,
        pinnedAllTabs: true,
        kind: "text",
        gridX: 0,
        gridY: 9,
        gridW: 4,
        gridH: 2,
      }),
    );

    return tabs;
  }

  async function publicProfile(username: string) {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/profile/${username}`,
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  describe("preference privacy (D1)", () => {
    it("never exposes language or theme on the public profile", async () => {
      const { user, auth } = await authed();

      // Save real preferences first — an absent field proves nothing if the
      // user never had one to leak.
      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "pt-BR", theme: "dark" }),
      });

      const payload = await publicProfile(user.login);

      expect(Object.keys(payload)).not.toContain("language");
      expect(Object.keys(payload)).not.toContain("theme");
      // Serialised deeply, not just at the top level.
      expect(JSON.stringify(payload)).not.toContain("pt-BR");
      // `themePreset` is the public one and must survive — this assertion is
      // what stops the test passing because the whole response went missing.
      expect(Object.keys(payload)).toContain("themePreset");
    });

    it("never exposes language or theme on /me either", async () => {
      const { auth } = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "es-ES", theme: "light" }),
      });

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me",
        headers: auth,
      });

      // `/me` and `/profile/:username` share `profileSchema`, so a preference
      // that appears here would appear publicly the moment someone reuses the
      // mapper — which is exactly how this leak would happen.
      const payload = response.json();
      expect(Object.keys(payload)).not.toContain("language");
      expect(Object.keys(payload)).not.toContain("theme");
    });

    it("produces a public payload the shared schema accepts", async () => {
      const { user } = await authed();
      const payload = await publicProfile(user.login);

      expect(() => profileSchema.parse(payload)).not.toThrow();
    });
  });

  describe("tabsEnabled (D2)", () => {
    it("defaults to true for an account that never set it", async () => {
      const { user, auth } = await authed();

      const me = await ctx.app.inject({
        method: "GET",
        url: "/me",
        headers: auth,
      });

      expect(me.json().tabsEnabled).toBe(true);
      expect((await publicProfile(user.login)).tabsEnabled).toBe(true);
    });

    it("round-trips through PUT /profile into /me and the public profile", async () => {
      const { user, auth } = await authed();

      const update = await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, tabsEnabled: false }),
      });

      expect(update.statusCode).toBe(200);
      expect(update.json().tabsEnabled).toBe(false);

      const me = await ctx.app.inject({
        method: "GET",
        url: "/me",
        headers: auth,
      });
      expect(me.json().tabsEnabled).toBe(false);

      // The public renderer is the only consumer that matters here: without
      // this key it cannot know whether to draw the tab strip at all.
      expect((await publicProfile(user.login)).tabsEnabled).toBe(false);
    });

    it("leaves tabsEnabled alone when a PUT does not mention it", async () => {
      const { user, auth } = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, tabsEnabled: false }),
      });

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, name: "Renamed" }),
      });

      expect(response.json().tabsEnabled).toBe(false);
    });

    it("destroys no tab or block data when toggled off and back on", async () => {
      const { user, auth } = await authed();
      await seedLayout(user);

      const before = (await publicProfile(user.login)).layout;
      expect(before.pc.tabs).toHaveLength(3);
      expect(before.pc.blocks).toHaveLength(4);

      await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, tabsEnabled: false }),
      });

      // Off: the layout is still fully present. Hiding tabs is a rendering
      // decision the client makes; the API must keep serving the data or the
      // toggle becomes a delete with a friendly label.
      const whileOff = (await publicProfile(user.login)).layout;
      expect(whileOff).toEqual(before);

      await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, tabsEnabled: true }),
      });

      const after = (await publicProfile(user.login)).layout;
      expect(after).toEqual(before);
    });

    it("rejects a non-boolean tabsEnabled with 400", async () => {
      const { user, auth } = await authed();

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/profile",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ username: user.login, tabsEnabled: "no" }),
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
