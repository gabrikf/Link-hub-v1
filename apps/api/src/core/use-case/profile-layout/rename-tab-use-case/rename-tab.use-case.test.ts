import { beforeEach, describe, expect, it } from "vitest";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { RenameTabUseCase } from "./rename-tab.use-case.js";

describe("RenameTabUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let sut: RenameTabUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    sut = new RenameTabUseCase(tabsRepository);
  });

  async function seedTab(userId = "user-1") {
    const tab = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "Old",
      order: 0,
    });
    await tabsRepository.create(tab);
    return tab;
  }

  it("renames an owned tab", async () => {
    const tab = await seedTab();

    const result = await sut.execute("user-1", tab.id, "New title");

    expect(result.title).toBe("New title");
  });

  it("throws when the tab does not exist", async () => {
    await expect(
      sut.execute("user-1", "missing", "New"),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("throws when the tab belongs to another user", async () => {
    const tab = await seedTab("other-user");

    await expect(
      sut.execute("user-1", tab.id, "New"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
