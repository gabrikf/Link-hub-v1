import { beforeEach, describe, expect, it } from "vitest";
import { FullProfileLayout, ProfileLayout } from "@repo/schemas";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { GetLayoutUseCase } from "./get-layout.use-case.js";

describe("GetLayoutUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: GetLayoutUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new GetLayoutUseCase(tabsRepository, blocksRepository);
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
    expect(tabsRepository.getAll()).toHaveLength(1);
    expect(blocksRepository.getAll()).toHaveLength(4);
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
});
