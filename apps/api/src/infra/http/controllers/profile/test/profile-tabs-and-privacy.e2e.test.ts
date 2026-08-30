/**
 * E2E tests for the two profile-payload guarantees this change introduces:
 *
 *  1. `tabsEnabled` really travels — PER VIEWPORT, through
 *     `PATCH /me/layout/tabs-enabled` and back out inside `layout.pc` /
 *     `layout.mobile` on the fully public `/profile/:username`, which is the
 *     only place the public renderer can learn whether to draw the tab strip.
 *  2. The private preferences do NOT travel. `profileSchema` feeds both `/me`
 *     and an anonymous `/profile/:username`, so the day someone adds `language`
 *     and `theme` next to `themePreset` a person's UI settings become public.
 *     That is asserted here on a real payload rather than trusted to review.
 *  3. Tab CONTENT does not travel while tabs are off. `tabsEnabled: false` means
 *     the strip is never rendered, so the public payload drops the tabs and
 *     every non-pinned block. The browser was already hiding them; `curl` was
 *     not, which made "hidden" a UI illusion.
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

describe("Profile payload: per-viewport tabsEnabled and preference privacy", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authed(overrides?: {
    tabsEnabledPc?: boolean;
    tabsEnabledMobile?: boolean;
  }) {
    const user = await ctx.seedUser(overrides);
    const token = await ctx.signJwt(user.id);
    return { user, auth: { authorization: `Bearer ${token}` } };
  }

  /**
   * An account whose tab strip is already ON for both viewports, stated rather
   * than inherited. A BRAND-NEW account now starts with both OFF — a new
   * profile publishes its always-visible zone and nothing else — so a test
   * about one viewport's switch not disturbing the other has to say where it
   * starts, or "mobile is still on" would be asserting the default it never set.
   */
  const withTabsOn = () =>
    authed({ tabsEnabledPc: true, tabsEnabledMobile: true });

  /**
   * Three tabs per viewport with one block each, plus a block pinned to all
   * tabs. BOTH viewports are seeded on purpose: an unseeded viewport is
   * rendered from an in-memory default layout with fresh ids on every request,
   * so it could never be compared across two reads.
   */
  interface SeededViewportIds {
    tabIds: string[];
    tabBlockIds: string[];
    pinnedBlockId: string;
  }

  async function seedLayout(
    user: UserEntity,
  ): Promise<Record<"pc" | "mobile", SeededViewportIds>> {
    const seeded = {} as Record<"pc" | "mobile", SeededViewportIds>;

    for (const viewport of ["pc", "mobile"] as const) {
      const tabs = await Promise.all(
        ["Work", "Writing", "Contact"].map((title, order) =>
          ctx.profileTabsRepository.create(
            ProfileTabEntity.create({
              userId: user.id,
              viewport,
              title,
              order,
            }),
          ),
        ),
      );

      const tabBlockIds: string[] = [];
      for (const [index, tab] of tabs.entries()) {
        const block = await ctx.profileBlocksRepository.create(
          ProfileBlockEntity.create({
            userId: user.id,
            viewport,
            tabId: tab.id,
            kind: "links",
            gridX: 0,
            gridY: index,
            gridW: 4,
            gridH: 2,
            // A recognisable payload, so "the block is gone" can be asserted on
            // the serialised response and not only on a missing id.
            config: { label: `secret-${viewport}-${index}` },
          }),
        );
        tabBlockIds.push(block.id);
      }

      // Pinned: tabId null, visible on every tab. The one most at risk from a
      // "tabs off" implementation that filters by the first tab's id.
      const pinned = await ctx.profileBlocksRepository.create(
        ProfileBlockEntity.create({
          userId: user.id,
          viewport,
          tabId: null,
          pinnedAllTabs: true,
          kind: "text",
          gridX: 0,
          gridY: 9,
          gridW: 4,
          gridH: 2,
        }),
      );

      seeded[viewport] = {
        tabIds: tabs.map((tab) => tab.id),
        tabBlockIds,
        pinnedBlockId: pinned.id,
      };
    }

    return seeded;
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

  describe("tabsEnabled per viewport (D8, D10)", () => {
    async function setTabsEnabled(
      auth: Record<string, string>,
      viewport: "pc" | "mobile",
      tabsEnabled: boolean,
    ) {
      return ctx.app.inject({
        method: "PATCH",
        url: "/me/layout/tabs-enabled",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ viewport, tabsEnabled }),
      });
    }

    /*
     * The new-account default, end to end. A profile nobody has arranged yet
     * publishes the always-visible zone only, so both viewports report their
     * tab strip off. This test used to assert `true` for both — it encoded the
     * old default, where a new profile published every seeded block on day one.
     */
    it("defaults both viewports to OFF for an account that never set them", async () => {
      const { user } = await authed();

      const { layout } = await publicProfile(user.login);

      expect(layout.pc.tabsEnabled).toBe(false);
      expect(layout.mobile.tabsEnabled).toBe(false);
    });

    it("turning pc off leaves mobile on", async () => {
      const { user, auth } = await withTabsOn();
      await seedLayout(user);

      const response = await setTabsEnabled(auth, "pc", false);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ viewport: "pc", tabsEnabled: false });

      // The reported bug: one shared flag made this assertion fail on the
      // second line, because writing pc also wrote mobile.
      const { layout } = await publicProfile(user.login);
      expect(layout.pc.tabsEnabled).toBe(false);
      expect(layout.mobile.tabsEnabled).toBe(true);
    });

    it("turning mobile off leaves pc on", async () => {
      const { user, auth } = await withTabsOn();
      await seedLayout(user);

      const response = await setTabsEnabled(auth, "mobile", false);
      expect(response.statusCode).toBe(200);

      const { layout } = await publicProfile(user.login);
      expect(layout.pc.tabsEnabled).toBe(true);
      expect(layout.mobile.tabsEnabled).toBe(false);
    });

    it("serves each viewport its own flag on the editor layout read too", async () => {
      const { auth } = await withTabsOn();

      await setTabsEnabled(auth, "mobile", false);

      const response = await ctx.app.inject({
        method: "GET",
        url: "/me/layout",
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pc.tabsEnabled).toBe(true);
      expect(response.json().mobile.tabsEnabled).toBe(false);
    });

    it("destroys no tab or block data when toggled off and back on", async () => {
      const { user, auth } = await withTabsOn();
      await seedLayout(user);

      const before = (await publicProfile(user.login)).layout;
      expect(before.pc.tabs).toHaveLength(3);
      expect(before.pc.blocks).toHaveLength(4);

      await setTabsEnabled(auth, "pc", false);

      // Off: the data still exists — asserted where it is supposed to be
      // visible, the OWNER's editor payload. (The public payload is
      // deliberately narrowed while tabs are off; that is asserted in the
      // "public payload while tabs are off" block below.) Hiding tabs must not
      // become a delete with a friendly label.
      const ownerWhileOff = await ctx.app.inject({
        method: "GET",
        url: "/me/layout",
        headers: auth,
      });
      expect(ownerWhileOff.json().pc.tabs).toHaveLength(3);
      expect(ownerWhileOff.json().pc.blocks).toHaveLength(4);

      await setTabsEnabled(auth, "pc", true);

      // Byte-identical to the starting layout: no block, no tab and no
      // `isVisible` was written along the way (D10).
      const after = (await publicProfile(user.login)).layout;
      expect(after).toEqual(before);
    });

    it("writes nothing but the one flag — no block or tab row is touched", async () => {
      const { user, auth } = await authed();
      await seedLayout(user);

      const tabsBefore = structuredClone(ctx.profileTabsRepository.getAll());
      const blocksBefore = structuredClone(
        ctx.profileBlocksRepository.getAll(),
      );

      await setTabsEnabled(auth, "pc", false);
      await setTabsEnabled(auth, "mobile", false);

      // Asserted on the STORE, not on the response: a use case that quietly
      // set `isVisible` on every tabbed block would still return 200.
      expect(ctx.profileTabsRepository.getAll()).toEqual(tabsBefore);
      expect(ctx.profileBlocksRepository.getAll()).toEqual(blocksBefore);
    });

    it("rejects an anonymous caller with 401", async () => {
      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/layout/tabs-enabled",
        headers: JSON_HEADERS,
        body: JSON.stringify({ viewport: "pc", tabsEnabled: false }),
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects an unknown viewport with 400", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/layout/tabs-enabled",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ viewport: "tablet", tabsEnabled: false }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a non-boolean tabsEnabled with 400", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/me/layout/tabs-enabled",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ viewport: "pc", tabsEnabled: "no" }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("is reachable under /api/v1 as well", async () => {
      const { user, auth } = await authed();

      const response = await ctx.app.inject({
        method: "PATCH",
        url: "/api/v1/me/layout/tabs-enabled",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ viewport: "mobile", tabsEnabled: false }),
      });

      expect(response.statusCode).toBe(200);
      expect((await publicProfile(user.login)).layout.mobile.tabsEnabled).toBe(
        false,
      );
    });

    /**
     * The sibling guarantee to preference privacy above: with tabs off the tab
     * strip is not rendered, so no anonymous caller may receive its titles or
     * its blocks. The browser already hid them; `curl` did not, which is what
     * makes this an API defect rather than a UI one.
     */
    describe("public payload while tabs are off", () => {
      async function ownerLayout(auth: Record<string, string>) {
        const response = await ctx.app.inject({
          method: "GET",
          url: "/me/layout",
          headers: auth,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      }

      it("withholds tab titles and tab blocks from the public payload", async () => {
        const { user, auth } = await authed();
        const seeded = await seedLayout(user);

        await setTabsEnabled(auth, "pc", false);

        const { pc } = (await publicProfile(user.login)).layout;

        expect(pc.tabs).toEqual([]);
        expect(pc.tabsEnabled).toBe(false);
        // Only the pinned block survives — it is the always-visible zone, the
        // one thing the profile actually renders with tabs off.
        expect(pc.blocks.map((block: { id: string }) => block.id)).toEqual([
          seeded.pc.pinnedBlockId,
        ]);
        // Serialised, so a config or title smuggled in under another key is
        // caught too.
        const serialised = JSON.stringify(pc);
        expect(serialised).not.toContain("Work");
        expect(serialised).not.toContain("secret-pc-");
        for (const id of [...seeded.pc.tabIds, ...seeded.pc.tabBlockIds]) {
          expect(serialised).not.toContain(id);
        }
      });

      it("still serves the owner every tab and block on /me/layout", async () => {
        const { user, auth } = await authed();
        const seeded = await seedLayout(user);

        await setTabsEnabled(auth, "pc", false);

        const { pc } = await ownerLayout(auth);

        // The whole point of the asymmetry: the owner edits what the public
        // cannot see. Narrowing this payload too would make the toggle look
        // like it destroyed the content.
        expect(pc.tabs.map((tab: { id: string }) => tab.id)).toEqual(
          seeded.pc.tabIds,
        );
        expect(pc.blocks).toHaveLength(4);
        for (const id of seeded.pc.tabBlockIds) {
          expect(pc.blocks.map((block: { id: string }) => block.id)).toContain(
            id,
          );
        }
        expect(pc.tabsEnabled).toBe(false);
      });

      it("strips only the viewport whose tabs are off", async () => {
        const { user, auth } = await withTabsOn();
        const seeded = await seedLayout(user);

        await setTabsEnabled(auth, "pc", false);

        const { layout } = await publicProfile(user.login);

        // Per-viewport independence has to survive the new filter: mobile is
        // still on, so it keeps all three tabs and all four blocks.
        expect(layout.mobile.tabs).toHaveLength(3);
        expect(layout.mobile.blocks).toHaveLength(4);
        expect(JSON.stringify(layout.mobile)).toContain("secret-mobile-0");
        for (const id of seeded.mobile.tabBlockIds) {
          expect(
            layout.mobile.blocks.map((block: { id: string }) => block.id),
          ).toContain(id);
        }
        expect(layout.pc.blocks).toHaveLength(1);
      });

      it("restores the full public payload when tabs are switched back on", async () => {
        const { user, auth } = await withTabsOn();
        await seedLayout(user);

        const before = (await publicProfile(user.login)).layout.pc;

        await setTabsEnabled(auth, "pc", false);
        await setTabsEnabled(auth, "pc", true);

        // Withholding is a read-time filter, never a write.
        expect((await publicProfile(user.login)).layout.pc).toEqual(before);
      });

      it("hides a block that is both pinned and invisible", async () => {
        const { user, auth } = await authed();
        await seedLayout(user);

        // Seeded through the repository like the rest of the fixture: the
        // hermetic app does not register UpdateBlockUseCase, so the visibility
        // toggle has no HTTP route here.
        const hiddenPin = await ctx.profileBlocksRepository.create(
          ProfileBlockEntity.create({
            userId: user.id,
            viewport: "pc",
            tabId: null,
            pinnedAllTabs: true,
            isVisible: false,
            kind: "text",
            gridX: 0,
            gridY: 10,
            gridW: 4,
            gridH: 2,
          }),
        );

        await setTabsEnabled(auth, "pc", false);

        // `isVisible` still wins with tabs off — the pinned filter is added to
        // it, not substituted for it. The owner keeps seeing the block.
        const { pc } = (await publicProfile(user.login)).layout;
        expect(pc.blocks.map((block: { id: string }) => block.id)).not.toContain(
          hiddenPin.id,
        );
        expect(pc.blocks).toHaveLength(1);

        expect(
          (await ownerLayout(auth)).pc.blocks.map(
            (block: { id: string }) => block.id,
          ),
        ).toContain(hiddenPin.id);
      });
    });
  });
});
