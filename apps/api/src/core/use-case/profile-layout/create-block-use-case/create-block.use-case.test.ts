import { beforeEach, describe, expect, it } from "vitest";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import { BadRequestError } from "../../../errors/index.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { CreateBlockUseCase } from "./create-block.use-case.js";

describe("CreateBlockUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: CreateBlockUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new CreateBlockUseCase(tabsRepository, blocksRepository);
  });

  it("seeds the viewport and appends a full-width block in the first tab", async () => {
    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      config: { body: "Hello world" },
    });

    expect(block.kind).toBe("text");
    expect(block.gridW).toBe(12);
    expect(block.pinnedAllTabs).toBe(false);
    expect(block.tabId).not.toBeNull();
    // Appended below the seeded built-ins (which reach gridY 10 + gridH 6 = 16).
    expect(block.gridY).toBe(16);
  });

  it("creates a pinned block when tabId is null", async () => {
    const block = await sut.execute("user-1", {
      kind: "button",
      viewport: "pc",
      tabId: null,
      config: { label: "Download", url: "https://cv.dev" },
    });

    expect(block.tabId).toBeNull();
    expect(block.pinnedAllTabs).toBe(true);
  });

  it("respects an explicit placement", async () => {
    const tab = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(tab);

    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      tabId: tab.id,
      config: { body: "Placed" },
      placement: { gridX: 2, gridY: 3, gridW: 6, gridH: 5 },
    });

    expect(block.gridX).toBe(2);
    expect(block.gridY).toBe(3);
    expect(block.gridW).toBe(6);
    expect(block.gridH).toBe(5);
  });

  it("rejects an unknown target tab", async () => {
    const tab = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(tab);

    await expect(
      sut.execute("user-1", {
        kind: "text",
        viewport: "pc",
        tabId: "missing-tab",
        config: { body: "x" },
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
