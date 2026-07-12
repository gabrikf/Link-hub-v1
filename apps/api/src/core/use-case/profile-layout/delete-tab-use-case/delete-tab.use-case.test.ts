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
import { DeleteTabUseCase } from "./delete-tab.use-case.js";

describe("DeleteTabUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: DeleteTabUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new DeleteTabUseCase(tabsRepository, blocksRepository);
  });

  async function seedTwoTabs(userId = "user-1") {
    const first = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "First",
      order: 0,
    });
    const second = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "Second",
      order: 1,
    });
    await tabsRepository.create(first);
    await tabsRepository.create(second);
    return { first, second };
  }

  it("deletes an owned tab and its blocks", async () => {
    const { first } = await seedTwoTabs();

    const block = ProfileBlockEntity.create({
      userId: "user-1",
      viewport: "pc",
      tabId: first.id,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: { body: "hi" },
    });
    await blocksRepository.create(block);

    const result = await sut.execute("user-1", first.id);

    expect(result.success).toBe(true);
    expect(await tabsRepository.findById(first.id)).toBeNull();
    expect(blocksRepository.getAll()).toHaveLength(0);
  });

  it("refuses to delete the last remaining tab", async () => {
    const tab = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Only",
      order: 0,
    });
    await tabsRepository.create(tab);

    await expect(sut.execute("user-1", tab.id)).rejects.toBeInstanceOf(
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
