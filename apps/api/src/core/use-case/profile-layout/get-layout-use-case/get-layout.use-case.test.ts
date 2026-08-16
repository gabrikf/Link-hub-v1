import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BUILTIN_BLOCKS,
  FullProfileLayout,
  ProfileLayout,
} from "@repo/schemas";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { GetLayoutUseCase } from "./get-layout.use-case.js";

// Derived rather than hard-coded so adding a default block is a one-line change
// in the schema package, not a hunt through the layout tests.
const DEFAULT_BLOCK_COUNT = DEFAULT_BUILTIN_BLOCKS.length;
const MIRRORED_BLOCK_COUNT = DEFAULT_BLOCK_COUNT * 2;

describe("GetLayoutUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let sut: GetLayoutUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
    sut = new GetLayoutUseCase(tabsRepository, blocksRepository, unitOfWork);
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
});
