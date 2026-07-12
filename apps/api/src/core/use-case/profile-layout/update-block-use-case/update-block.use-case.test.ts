import { beforeEach, describe, expect, it } from "vitest";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { UpdateBlockUseCase } from "./update-block.use-case.js";

describe("UpdateBlockUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: UpdateBlockUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new UpdateBlockUseCase(tabsRepository, blocksRepository);
  });

  async function seedTab(userId = "user-1") {
    const tab = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(tab);
    return tab;
  }

  async function seedTextBlock(tabId: string, userId = "user-1") {
    const block = ProfileBlockEntity.create({
      userId,
      viewport: "pc",
      tabId,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: { body: "original" },
    });
    await blocksRepository.create(block);
    return block;
  }

  it("validates and updates custom config", async () => {
    const tab = await seedTab();
    const block = await seedTextBlock(tab.id);

    const result = await sut.execute("user-1", block.id, {
      config: { body: "updated" },
    });

    expect(result.config).toEqual({ body: "updated" });
  });

  it("rejects invalid config for the block kind", async () => {
    const tab = await seedTab();
    const block = await seedTextBlock(tab.id);

    await expect(
      sut.execute("user-1", block.id, { config: { body: "" } }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("toggles visibility", async () => {
    const tab = await seedTab();
    const block = await seedTextBlock(tab.id);

    const result = await sut.execute("user-1", block.id, { isVisible: false });

    expect(result.isVisible).toBe(false);
  });

  it("pins a block, clearing its tabId", async () => {
    const tab = await seedTab();
    const block = await seedTextBlock(tab.id);

    const result = await sut.execute("user-1", block.id, {
      pinnedAllTabs: true,
    });

    expect(result.pinnedAllTabs).toBe(true);
    expect(result.tabId).toBeNull();
  });

  it("unpins to the first tab when none is supplied", async () => {
    const tab = await seedTab();
    const block = ProfileBlockEntity.create({
      userId: "user-1",
      viewport: "pc",
      tabId: null,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      pinnedAllTabs: true,
      config: { body: "pinned" },
    });
    await blocksRepository.create(block);

    const result = await sut.execute("user-1", block.id, {
      pinnedAllTabs: false,
    });

    expect(result.pinnedAllTabs).toBe(false);
    expect(result.tabId).toBe(tab.id);
  });

  it("moves a block to another tab", async () => {
    const tab = await seedTab();
    const other = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Other",
      order: 1,
    });
    await tabsRepository.create(other);
    const block = await seedTextBlock(tab.id);

    const result = await sut.execute("user-1", block.id, { tabId: other.id });

    expect(result.tabId).toBe(other.id);
    expect(result.pinnedAllTabs).toBe(false);
  });

  it("throws when the block is not found", async () => {
    await expect(
      sut.execute("user-1", "missing", { isVisible: false }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("throws when the block belongs to another user", async () => {
    const tab = await seedTab("other-user");
    const block = await seedTextBlock(tab.id, "other-user");

    await expect(
      sut.execute("user-1", block.id, { isVisible: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
