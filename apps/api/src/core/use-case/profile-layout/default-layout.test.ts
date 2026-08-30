import { DEFAULT_TABS_ENABLED, ProfileViewport } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../entity/user/user-entity.js";
import { InMemoryUnitOfWork } from "../../providers/unit-of-work/in-memory-unit-of-work.js";
import { InMemoryProfileBlocksRepository } from "../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryProfileTabsRepository } from "../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { toPublicLayout } from "./assemble-layout.js";
import {
  ensureSeededViewport,
  seedDefaultLayout,
  VIEWPORTS,
} from "./seed-default-layout.js";

/**
 * What a BRAND-NEW profile starts as, and — just as important — what it does
 * NOT do to a profile that already exists.
 *
 * The product rule: a new profile publishes the photo, the name and the links,
 * and nothing else. Resume, work history and posts are seeded into the default
 * tab, arranged and ready, but the tab strip is off, so they are not on the
 * page until the owner turns it on. Turning it on must reveal a finished
 * profile — no block to add, no tab to create, no grid to arrange.
 */
describe("the default layout a new profile starts with", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
  });

  const newUser = () =>
    UserEntity.create({
      email: "new@example.com",
      login: "new-user",
      name: "New User",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

  it("starts a new account with the tab strip off in BOTH viewports", () => {
    const user = newUser();

    expect(DEFAULT_TABS_ENABLED).toBe(false);
    expect(user.tabsEnabledPc).toBe(false);
    expect(user.tabsEnabledMobile).toBe(false);
    for (const viewport of VIEWPORTS) {
      expect(user.tabsEnabledFor(viewport)).toBe(false);
    }
  });

  describe.each(VIEWPORTS)("seeded %s layout", (viewport: ProfileViewport) => {
    it("pins the header and the links, and nothing else", () => {
      const { blocks } = seedDefaultLayout("user-1")[viewport];

      const pinned = blocks.filter((block) => block.pinnedAllTabs);
      expect(pinned.map((block) => block.kind)).toEqual(["header", "links"]);
      expect(pinned.every((block) => block.tabId === null)).toBe(true);
      // The two pinned blocks stack rather than overlap: the pinned zone is its
      // own grid, so its rows start at 0.
      expect(pinned.map((block) => block.gridY)).toEqual([0, 4]);
    });

    it("pre-places resume, work history and posts in the default tab", () => {
      const { tab, blocks } = seedDefaultLayout("user-1")[viewport];

      const inTab = blocks.filter((block) => !block.pinnedAllTabs);
      expect(inTab.map((block) => block.kind)).toEqual([
        "resume",
        "work_experiences",
        "posts",
      ]);
      expect(inTab.every((block) => block.tabId === tab.id)).toBe(true);
      expect(inTab.every((block) => block.isVisible)).toBe(true);
      // Re-based from 0 now that `links` left this zone — the tab grid has its
      // own y-axis, and starting at row 4 would have opened with a hole.
      expect(inTab.map((block) => block.gridY)).toEqual([0, 6, 12]);
    });

    it("publishes the always-visible zone only while tabs are off", () => {
      const { tab, blocks } = seedDefaultLayout("user-1")[viewport];

      const published = toPublicLayout([tab], blocks, false);

      expect(published.tabs).toEqual([]);
      expect(published.blocks.map((block) => block.kind)).toEqual([
        "header",
        "links",
      ]);
    });

    /*
     * The other half of the promise: the switch is the ONLY thing standing
     * between the minimal profile and the full one.
     */
    it("reveals the pre-placed blocks the moment tabs are turned on", () => {
      const { tab, blocks } = seedDefaultLayout("user-1")[viewport];

      const revealed = toPublicLayout([tab], blocks, true);

      expect(revealed.tabs.map((entry) => entry.title)).toEqual(["Main"]);
      expect(revealed.blocks.map((block) => block.kind)).toEqual([
        "header",
        "links",
        "resume",
        "work_experiences",
        "posts",
      ]);
      // Nothing to configure afterwards: the seeded posts feed already carries
      // its display config, which built-ins do not have.
      expect(
        revealed.blocks.find((block) => block.kind === "posts")?.config,
      ).toEqual({ title: "Posts", limit: 5, layout: "list" });
    });
  });

  /*
   * The migration hazard. Seeding is lazy — it fires on a user's FIRST layout
   * access — so an account that has been around for years and simply never
   * opened the editor must not be handed the new minimal default on top of
   * whatever it already has.
   */
  describe("an account that already has a layout", () => {
    it("is left exactly as it is — no re-seed, no extra rows", async () => {
      const existing = seedDefaultLayout("old-user").pc;
      await tabsRepository.create(existing.tab);
      // One block only, deliberately unlike the default set, so a re-seed
      // would be impossible to miss.
      await blocksRepository.create(existing.blocks[0]!);

      const before = await blocksRepository.findByUserAndViewport(
        "old-user",
        "pc",
      );

      const result = await ensureSeededViewport(
        tabsRepository,
        blocksRepository,
        unitOfWork,
        "old-user",
        "pc",
      );

      expect(result.tabs).toEqual([existing.tab]);
      expect(result.blocks.map((block) => block.id)).toEqual(
        before.map((block) => block.id),
      );
      expect(
        await blocksRepository.findByUserAndViewport("old-user", "pc"),
      ).toHaveLength(1);
    });

    /*
     * `tabsEnabledPc`/`tabsEnabledMobile` are NOT NULL columns, so a stored row
     * always carries its own value and the constructor's default never fires
     * for it. Rebuilding an existing user must therefore return the flags it
     * was stored with — including `true`, which is what every account created
     * before this change has.
     */
    it("keeps a stored tabsEnabled of true when the entity is rebuilt", () => {
      const now = new Date();
      const stored = new UserEntity({
        id: "old-user",
        email: "old@example.com",
        login: "old-user",
        name: "Old User",
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
        tabsEnabledPc: true,
        tabsEnabledMobile: true,
        createdAt: now,
        updatedAt: now,
      });

      expect(stored.tabsEnabledPc).toBe(true);
      expect(stored.tabsEnabledMobile).toBe(true);
    });
  });
});
