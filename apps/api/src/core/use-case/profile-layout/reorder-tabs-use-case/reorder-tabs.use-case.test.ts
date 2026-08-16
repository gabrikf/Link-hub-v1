import { beforeEach, describe, expect, it } from "vitest";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import {
  BadRequestError,
  ForbiddenError,
} from "../../../errors/index.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { ReorderTabsUseCase } from "./reorder-tabs.use-case.js";

describe("ReorderTabsUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let sut: ReorderTabsUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    sut = new ReorderTabsUseCase(tabsRepository);
  });

  async function seedTabs(userId = "user-1") {
    const a = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "A",
      order: 0,
    });
    const b = ProfileTabEntity.create({
      userId,
      viewport: "pc",
      title: "B",
      order: 1,
    });
    await tabsRepository.create(a);
    await tabsRepository.create(b);
    return { a, b };
  }

  it("reorders tabs by provided ids", async () => {
    const { a, b } = await seedTabs();

    const result = await sut.execute("user-1", {
      viewport: "pc",
      tabIds: [b.id, a.id],
    });

    const ordered = await tabsRepository.findByUserAndViewport("user-1", "pc");

    expect(result.success).toBe(true);
    expect(ordered[0]?.id).toBe(b.id);
    expect(ordered[1]?.id).toBe(a.id);
  });

  it("does not reorder the other viewport's tabs", async () => {
    const make = (viewport: "pc" | "mobile", title: string, order: number) =>
      ProfileTabEntity.create({ userId: "user-1", viewport, title, order });

    const pcA = make("pc", "A", 0);
    const pcB = make("pc", "B", 1);
    const mobileA = make("mobile", "A", 0);
    const mobileB = make("mobile", "B", 1);
    for (const tab of [pcA, pcB, mobileA, mobileB]) {
      await tabsRepository.create(tab);
    }

    // Reorder only the pc list; mobile keeps its own order.
    await sut.execute("user-1", { viewport: "pc", tabIds: [pcB.id, pcA.id] });

    const pcOrdered = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileOrdered = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );

    expect(pcOrdered.map((t) => t.id)).toEqual([pcB.id, pcA.id]);
    expect(mobileOrdered.map((t) => t.id)).toEqual([mobileA.id, mobileB.id]);
  });

  it("only validates the ids of the requested viewport", async () => {
    const { a, b } = await seedTabs();
    const mobile = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "mobile",
      title: "Mobile",
      order: 0,
    });
    await tabsRepository.create(mobile);

    // A mobile tab id is foreign to the pc list, even though the user owns it.
    await expect(
      sut.execute("user-1", { viewport: "pc", tabIds: [a.id, mobile.id] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      sut.execute("user-1", { viewport: "pc", tabIds: [b.id, a.id] }),
    ).resolves.toEqual({ success: true });
  });

  it("throws when an id is not owned", async () => {
    const { a } = await seedTabs();

    await expect(
      sut.execute("user-1", { viewport: "pc", tabIds: [a.id, "foreign"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws when the set is incomplete", async () => {
    const { a } = await seedTabs();

    await expect(
      sut.execute("user-1", { viewport: "pc", tabIds: [a.id] }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
