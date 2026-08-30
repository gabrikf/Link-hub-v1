import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BUILTIN_BLOCKS,
  FullProfileLayout,
  ProfileLayout,
} from "@repo/schemas";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { GetLayoutUseCase } from "./get-layout.use-case.js";

// Derived rather than hard-coded so adding a default block is a one-line change
// in the schema package, not a hunt through the layout tests.
const DEFAULT_BLOCK_COUNT = DEFAULT_BUILTIN_BLOCKS.length;
const MIRRORED_BLOCK_COUNT = DEFAULT_BLOCK_COUNT * 2;

describe("GetLayoutUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let usersRepository: InMemoryUsersRepository;
  let sut: GetLayoutUseCase;

  /**
   * The layout read now needs the owner's row: `tabsEnabled` is two columns on
   * `users`, one per viewport, and only the user knows them.
   */
  async function seedUser(props?: {
    tabsEnabledPc?: boolean;
    tabsEnabledMobile?: boolean;
  }) {
    const now = new Date();
    await usersRepository.create(
      new UserEntity({
        id: "user-1",
        email: "user-1@example.com",
        login: "user-1",
        name: "User One",
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
        tabsEnabledPc: props?.tabsEnabledPc,
        tabsEnabledMobile: props?.tabsEnabledMobile,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  beforeEach(async () => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
    usersRepository = new InMemoryUsersRepository();
    sut = new GetLayoutUseCase(
      tabsRepository,
      blocksRepository,
      unitOfWork,
      usersRepository,
    );
    await seedUser();
  });

  it("seeds and persists a default layout for a single viewport", async () => {
    const layout = (await sut.execute("user-1", "pc")) as ProfileLayout;

    expect(layout.tabs).toHaveLength(1);
    expect(layout.blocks).toHaveLength(DEFAULT_BLOCK_COUNT);

    const header = layout.blocks.find((block) => block.kind === "header");
    expect(header?.pinnedAllTabs).toBe(true);
    expect(header?.tabId).toBeNull();

    // Persisted, so a second call must not create duplicates.
    const again = (await sut.execute("user-1", "pc")) as ProfileLayout;
    expect(again.tabs).toHaveLength(1);
    expect(again.blocks).toHaveLength(DEFAULT_BLOCK_COUNT);
    // Requesting a single viewport also seeds its counterpart, so the store
    // holds BOTH viewports (a tab each, 2x the blocks).
    expect(tabsRepository.getAll()).toHaveLength(2);
    expect(blocksRepository.getAll()).toHaveLength(MIRRORED_BLOCK_COUNT);
  });

  it("seeds each viewport its own tab, and blocks that pair by groupId", async () => {
    await sut.execute("user-1", "pc");

    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    // Independent tabs — no shared identity, and each anchors its own blocks.
    expect(pcTabs).toHaveLength(1);
    expect(mobileTabs).toHaveLength(1);
    expect(pcTabs[0]?.id).not.toBe(mobileTabs[0]?.id);

    const pcBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "pc",
    );
    const mobileBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    const pcGroups = pcBlocks.map((block) => block.groupId).sort();
    const mobileGroups = mobileBlocks.map((block) => block.groupId).sort();
    expect(pcGroups).toEqual(mobileGroups);
  });

  it("returns both viewports when no viewport is provided", async () => {
    const layout = (await sut.execute("user-1")) as FullProfileLayout;

    expect(layout.pc.tabs).toHaveLength(1);
    expect(layout.mobile.tabs).toHaveLength(1);
    expect(tabsRepository.getAll()).toHaveLength(2);
    expect(blocksRepository.getAll()).toHaveLength(MIRRORED_BLOCK_COUNT);
  });

  it("uses the viewport grid width when seeding", async () => {
    const layout = (await sut.execute("user-1", "mobile")) as ProfileLayout;

    expect(layout.blocks.every((block) => block.gridW === 4)).toBe(true);
  });

  it("is idempotent: seeding twice for the same user creates no duplicates", async () => {
    // The seed guard (unlocked check + advisory-locked re-check) must ensure a
    // second pass through the seed path is a no-op rather than a double-seed.
    await sut.execute("user-1");
    await sut.execute("user-1");

    // Still exactly one logical layout mirrored across both viewports.
    expect(tabsRepository.getAll()).toHaveLength(2);
    expect(blocksRepository.getAll()).toHaveLength(MIRRORED_BLOCK_COUNT);

    // No duplicate tab/block rows within a viewport either.
    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const pcBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "pc",
    );
    expect(pcTabs).toHaveLength(1);
    expect(pcBlocks).toHaveLength(DEFAULT_BLOCK_COUNT);
  });

  describe("tabsEnabled travels per viewport", () => {
    it("reports each viewport's own flag on the full layout", async () => {
      usersRepository.clear();
      await seedUser({ tabsEnabledPc: true, tabsEnabledMobile: false });

      const layout = (await sut.execute("user-1")) as FullProfileLayout;

      expect(layout.pc.tabsEnabled).toBe(true);
      expect(layout.mobile.tabsEnabled).toBe(false);
    });

    it("reports the requested viewport's own flag on a single-viewport read", async () => {
      usersRepository.clear();
      await seedUser({ tabsEnabledPc: false, tabsEnabledMobile: true });

      const pc = (await sut.execute("user-1", "pc")) as ProfileLayout;
      const mobile = (await sut.execute("user-1", "mobile")) as ProfileLayout;

      expect(pc.tabsEnabled).toBe(false);
      expect(mobile.tabsEnabled).toBe(true);
    });

    /*
     * The new-account default. A fresh profile starts minimal — the
     * always-visible zone only — so both viewports report their tab strip off.
     * This assertion used to read `true`; it encoded the old default.
     */
    it("defaults both viewports to OFF for a brand-new account", async () => {
      const layout = (await sut.execute("user-1")) as FullProfileLayout;

      expect(layout.pc.tabsEnabled).toBe(false);
      expect(layout.mobile.tabsEnabled).toBe(false);
    });

    /*
     * Turning tabs on must REVEAL the pre-placed blocks, not require the user
     * to build a tab first: seeding writes the default tab and its
     * resume/work/posts blocks regardless of the switch.
     */
    it("still seeds the default tab and its blocks while tabs are off", async () => {
      const layout = (await sut.execute("user-1")) as FullProfileLayout;

      for (const viewport of ["pc", "mobile"] as const) {
        expect(layout[viewport].tabs).toHaveLength(1);
        const tabId = layout[viewport].tabs[0]!.id;
        const inTab = layout[viewport].blocks.filter(
          (block) => !block.pinnedAllTabs && block.tabId === tabId,
        );
        expect(inTab.map((block) => block.kind)).toEqual([
          "resume",
          "work_experiences",
          "posts",
        ]);
      }
    });

    /*
     * The other half of "minimal": what IS published on day one. Header and
     * links are both pinned, so the always-visible zone is the whole profile
     * until the switch is flipped.
     */
    it("pins the header and the links into the always-visible zone", async () => {
      const layout = (await sut.execute("user-1")) as FullProfileLayout;

      for (const viewport of ["pc", "mobile"] as const) {
        const pinned = layout[viewport].blocks.filter(
          (block) => block.pinnedAllTabs,
        );
        expect(pinned.map((block) => block.kind)).toEqual(["header", "links"]);
        expect(pinned.every((block) => block.tabId === null)).toBe(true);
      }
    });
  });
});
