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
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { DeleteTabUseCase } from "./delete-tab.use-case.js";

describe("DeleteTabUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let sut: DeleteTabUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
    sut = new DeleteTabUseCase(tabsRepository, blocksRepository, unitOfWork);
  });

  async function seedTab(
    viewport: "pc" | "mobile",
    title: string,
    order: number,
    userId = "user-1",
  ) {
    const tab = ProfileTabEntity.create({ userId, viewport, title, order });
    await tabsRepository.create(tab);
    return tab;
  }

  async function seedTwoTabs(userId = "user-1") {
    const first = await seedTab("pc", "First", 0, userId);
    const second = await seedTab("pc", "Second", 1, userId);
    return { first, second };
  }

  async function seedBlock(
    viewport: "pc" | "mobile",
    tabId: string | null,
    groupId = crypto.randomUUID(),
    userId = "user-1",
  ) {
    const block = ProfileBlockEntity.create({
      userId,
      groupId,
      viewport,
      tabId,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: viewport === "pc" ? 12 : 4,
      gridH: 4,
      pinnedAllTabs: tabId === null,
      config: { body: "hi" },
    });
    await blocksRepository.create(block);
    return block;
  }

  it("deletes an owned tab and re-homes its blocks onto the first remaining tab", async () => {
    const { first, second } = await seedTwoTabs();
    const block = await seedBlock("pc", second.id);

    const result = await sut.execute("user-1", second.id);

    expect(result.success).toBe(true);
    expect(await tabsRepository.findById(second.id)).toBeNull();

    // The block survives — its content is shared with the mobile row, so
    // deleting it here would destroy content the other viewport still shows.
    const moved = await blocksRepository.findById(block.id);
    expect(moved?.tabId).toBe(first.id);
    expect(moved?.pinnedAllTabs).toBe(false);
  });

  it("leaves the other viewport's tabs and block assignments untouched", async () => {
    const pcKeep = await seedTab("pc", "Keep", 0);
    const pcDrop = await seedTab("pc", "Drop", 1);
    const mobileTab = await seedTab("mobile", "Mobile only", 0);

    // One logical block: a pc row in the doomed tab, a mobile row in the
    // mobile tab. Only the pc row may be touched.
    const groupId = crypto.randomUUID();
    const pcBlock = await seedBlock("pc", pcDrop.id, groupId);
    const mobileBlock = await seedBlock("mobile", mobileTab.id, groupId);

    await sut.execute("user-1", pcDrop.id);

    expect(await tabsRepository.findById(mobileTab.id)).not.toBeNull();
    expect(tabsRepository.getAll()).toHaveLength(2);

    expect((await blocksRepository.findById(pcBlock.id))?.tabId).toBe(
      pcKeep.id,
    );
    expect((await blocksRepository.findById(mobileBlock.id))?.tabId).toBe(
      mobileTab.id,
    );
  });

  it("leaves pinned blocks pinned", async () => {
    const { second } = await seedTwoTabs();
    const pinned = await seedBlock("pc", null);

    await sut.execute("user-1", second.id);

    const row = await blocksRepository.findById(pinned.id);
    expect(row?.pinnedAllTabs).toBe(true);
    expect(row?.tabId).toBeNull();
  });

  it("refuses to delete the last remaining tab of the viewport", async () => {
    const only = await seedTab("pc", "Only", 0);
    // A tab in the OTHER viewport must not make this one deletable.
    await seedTab("mobile", "Mobile", 0);

    await expect(sut.execute("user-1", only.id)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("throws when the tab does not exist", async () => {
    await expect(sut.execute("user-1", "missing")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("throws when the tab belongs to another user", async () => {
    const { first } = await seedTwoTabs("other-user");

    await expect(sut.execute("user-1", first.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
