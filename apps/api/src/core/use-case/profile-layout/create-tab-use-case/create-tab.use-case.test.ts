import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { CreateTabUseCase } from "./create-tab.use-case.js";

describe("CreateTabUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let sut: CreateTabUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    sut = new CreateTabUseCase(tabsRepository);
  });

  it("creates a tab at order 0 for an empty viewport", async () => {
    const tab = await sut.execute("user-1", {
      viewport: "pc",
      title: "Projects",
    });

    expect(tab.title).toBe("Projects");
    expect(tab.order).toBe(0);
  });

  it("does not create a desktop tab when a mobile tab is created", async () => {
    await sut.execute("user-1", { viewport: "mobile", title: "Projects" });

    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );

    // The whole point of the change: the two editors no longer duplicate each
    // other's tabs.
    expect(mobileTabs).toHaveLength(1);
    expect(pcTabs).toHaveLength(0);
    expect(tabsRepository.getAll()).toHaveLength(1);
  });

  it("does not create a mobile tab when a desktop tab is created", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "Projects" });

    expect(
      await tabsRepository.findByUserAndViewport("user-1", "mobile"),
    ).toHaveLength(0);
  });

  it("numbers each viewport's tabs independently", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "First" });
    const secondPc = await sut.execute("user-1", {
      viewport: "pc",
      title: "Second",
    });
    const firstMobile = await sut.execute("user-1", {
      viewport: "mobile",
      title: "Mobile only",
    });

    expect(secondPc.order).toBe(1);
    // Mobile starts its own sequence rather than continuing the pc one.
    expect(firstMobile.order).toBe(0);

    const pcTabs = await tabsRepository.findByUserAndViewport("user-1", "pc");
    expect(pcTabs.map((tab) => tab.title)).toEqual(["First", "Second"]);
  });
});
