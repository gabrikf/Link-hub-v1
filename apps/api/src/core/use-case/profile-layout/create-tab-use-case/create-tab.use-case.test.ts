import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { CreateTabUseCase } from "./create-tab.use-case.js";

describe("CreateTabUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let sut: CreateTabUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    unitOfWork = new InMemoryUnitOfWork();
    sut = new CreateTabUseCase(tabsRepository, unitOfWork);
  });

  it("creates a tab at order 0 for an empty viewport", async () => {
    const tab = await sut.execute("user-1", {
      viewport: "pc",
      title: "Projects",
    });

    expect(tab.title).toBe("Projects");
    expect(tab.order).toBe(0);
  });

  it("mirrors the tab into the other viewport with a shared groupId", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "Projects" });

    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );

    expect(pcTabs).toHaveLength(1);
    expect(mobileTabs).toHaveLength(1);
    // Same logical identity, same title/order — only the viewport differs.
    expect(pcTabs[0]?.groupId).toBe(mobileTabs[0]?.groupId);
    expect(mobileTabs[0]?.title).toBe("Projects");
    expect(mobileTabs[0]?.order).toBe(0);
    // Both viewports are seeded, but they remain distinct rows.
    expect(pcTabs[0]?.id).not.toBe(mobileTabs[0]?.id);
    expect(tabsRepository.getAll()).toHaveLength(2);
  });

  it("appends new tabs at the next order in both viewports", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "First" });
    const second = await sut.execute("user-1", {
      viewport: "pc",
      title: "Second",
    });

    expect(second.order).toBe(1);

    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    expect(mobileTabs.map((tab) => tab.order)).toEqual([0, 1]);
    expect(mobileTabs.map((tab) => tab.title)).toEqual(["First", "Second"]);
  });
});
