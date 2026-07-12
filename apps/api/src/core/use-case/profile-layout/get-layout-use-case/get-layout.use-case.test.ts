import { beforeEach, describe, expect, it } from "vitest";
import { FullProfileLayout, ProfileLayout } from "@repo/schemas";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { GetLayoutUseCase } from "./get-layout.use-case.js";

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
    expect(layout.blocks).toHaveLength(4);

    const header = layout.blocks.find((block) => block.kind === "header");
    expect(header?.pinnedAllTabs).toBe(true);
    expect(header?.tabId).toBeNull();

    // Persisted, so a second call must not create duplicates.
    const again = (await sut.execute("user-1", "pc")) as ProfileLayout;
    expect(again.tabs).toHaveLength(1);
    expect(again.blocks).toHaveLength(4);
    // Seeding mirrors: requesting a single viewport also seeds its counterpart
    // (shared groupIds), so the store holds BOTH viewports (2 tabs, 8 blocks).
    expect(tabsRepository.getAll()).toHaveLength(2);
    expect(blocksRepository.getAll()).toHaveLength(8);
  });

  it("seeds mirrored viewports that share groupIds", async () => {
    await sut.execute("user-1", "pc");

    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    expect(pcTabs[0]?.groupId).toBe(mobileTabs[0]?.groupId);

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
    expect(blocksRepository.getAll()).toHaveLength(8);
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
    expect(blocksRepository.getAll()).toHaveLength(8);

    // No duplicate tab/block rows within a viewport either.
    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const pcBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "pc",
    );
    expect(pcTabs).toHaveLength(1);
    expect(pcBlocks).toHaveLength(4);
  });
});
