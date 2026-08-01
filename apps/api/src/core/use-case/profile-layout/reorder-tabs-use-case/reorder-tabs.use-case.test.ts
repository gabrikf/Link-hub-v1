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

  it("mirrors the reorder to the other viewport by groupId", async () => {
    const groupA = crypto.randomUUID();
    const groupB = crypto.randomUUID();

    const make = (
      viewport: "pc" | "mobile",
      groupId: string,
      title: string,
      order: number,
    ) =>
      ProfileTabEntity.create({
        userId: "user-1",
        groupId,
        viewport,
        title,
        order,
      });

    const pcA = make("pc", groupA, "A", 0);
    const pcB = make("pc", groupB, "B", 1);
    const mobileA = make("mobile", groupA, "A", 0);
    const mobileB = make("mobile", groupB, "B", 1);
    for (const tab of [pcA, pcB, mobileA, mobileB]) {
      await tabsRepository.create(tab);
    }

    // Reorder only the pc list; mobile must follow the same logical order.
    await sut.execute("user-1", { viewport: "pc", tabIds: [pcB.id, pcA.id] });

    const pcOrdered = await tabsRepository.findByUserAndViewport("user-1", "pc");
    const mobileOrdered = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );

    expect(pcOrdered.map((t) => t.groupId)).toEqual([groupB, groupA]);
    expect(mobileOrdered.map((t) => t.groupId)).toEqual([groupB, groupA]);
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
