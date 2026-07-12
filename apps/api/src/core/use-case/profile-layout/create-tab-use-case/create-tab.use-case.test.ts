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

  it("appends new tabs at the next order", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "First" });
    const second = await sut.execute("user-1", {
      viewport: "pc",
      title: "Second",
    });

    expect(second.order).toBe(1);
  });

  it("scopes ordering per viewport", async () => {
    await sut.execute("user-1", { viewport: "pc", title: "PC tab" });
    const mobileTab = await sut.execute("user-1", {
      viewport: "mobile",
      title: "Mobile tab",
    });

    expect(mobileTab.order).toBe(0);
  });
});
