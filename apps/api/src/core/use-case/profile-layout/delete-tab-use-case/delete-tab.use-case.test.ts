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

  it("deletes the mirrored tab and its blocks in both viewports", async () => {
    const keepGroup = crypto.randomUUID();
    const dropGroup = crypto.randomUUID();

    // Two logical tabs, each mirrored across pc + mobile (4 tab rows).
    const rows = [
      { viewport: "pc" as const, groupId: keepGroup, order: 0 },
      { viewport: "mobile" as const, groupId: keepGroup, order: 0 },
      { viewport: "pc" as const, groupId: dropGroup, order: 1 },
      { viewport: "mobile" as const, groupId: dropGroup, order: 1 },
    ];
    const created = [];
    for (const row of rows) {
      const tab = ProfileTabEntity.create({
        userId: "user-1",
        groupId: row.groupId,
        viewport: row.viewport,
        title: "T",
        order: row.order,
      });
      await tabsRepository.create(tab);
      created.push(tab);
    }

    const dropPc = created.find(
      (t) => t.groupId === dropGroup && t.viewport === "pc",
    )!;
    const dropMobile = created.find(
      (t) => t.groupId === dropGroup && t.viewport === "mobile",
    )!;

    // A block anchored to each dropped viewport tab row.
    for (const tab of [dropPc, dropMobile]) {
      await blocksRepository.create(
        ProfileBlockEntity.create({
          userId: "user-1",
          viewport: tab.viewport,
          tabId: tab.id,
          kind: "text",
          gridX: 0,
          gridY: 0,
          gridW: tab.viewport === "pc" ? 12 : 4,
          gridH: 4,
          config: { body: "x" },
        }),
      );
    }

    await sut.execute("user-1", dropPc.id);

    // Both viewport rows of the dropped group are gone; the kept group remains.
    expect(await tabsRepository.findById(dropPc.id)).toBeNull();
    expect(await tabsRepository.findById(dropMobile.id)).toBeNull();
    expect(tabsRepository.getAll()).toHaveLength(2);
    expect(blocksRepository.getAll()).toHaveLength(0);
  });

  it("preserves pinned blocks while removing the tab's own blocks in both viewports", async () => {
    const keepGroup = crypto.randomUUID();
    const dropGroup = crypto.randomUUID();

    // Two logical tabs mirrored across pc + mobile (4 tab rows) so the dropped
    // tab is not the last remaining tab of either viewport.
    const tabRows = [
      { viewport: "pc" as const, groupId: keepGroup, order: 0 },
      { viewport: "mobile" as const, groupId: keepGroup, order: 0 },
      { viewport: "pc" as const, groupId: dropGroup, order: 1 },
      { viewport: "mobile" as const, groupId: dropGroup, order: 1 },
    ];
    const tabs = [];
    for (const row of tabRows) {
      const tab = ProfileTabEntity.create({
        userId: "user-1",
        groupId: row.groupId,
        viewport: row.viewport,
        title: "T",
        order: row.order,
      });
      await tabsRepository.create(tab);
      tabs.push(tab);
    }

    const dropPc = tabs.find(
      (t) => t.groupId === dropGroup && t.viewport === "pc",
    )!;
    const dropMobile = tabs.find(
      (t) => t.groupId === dropGroup && t.viewport === "mobile",
    )!;

    // A per-tab block anchored to each dropped viewport tab row.
    for (const tab of [dropPc, dropMobile]) {
      await blocksRepository.create(
        ProfileBlockEntity.create({
          userId: "user-1",
          viewport: tab.viewport,
          tabId: tab.id,
          kind: "text",
          gridX: 0,
          gridY: 0,
          gridW: tab.viewport === "pc" ? 12 : 4,
          gridH: 4,
          config: { body: "per-tab" },
        }),
      );
    }

    // A pinned block (tabId null, pinnedAllTabs) mirrored across both viewports.
    const pinnedGroup = crypto.randomUUID();
    for (const viewport of ["pc", "mobile"] as const) {
      await blocksRepository.create(
        ProfileBlockEntity.create({
          userId: "user-1",
          groupId: pinnedGroup,
          viewport,
          tabId: null,
          kind: "header",
          gridX: 0,
          gridY: 0,
          gridW: viewport === "pc" ? 12 : 4,
          gridH: 4,
          pinnedAllTabs: true,
          config: null,
        }),
      );
    }

    await sut.execute("user-1", dropPc.id);

    const remaining = blocksRepository.getAll();
    // Both pinned rows survive in both viewports; both per-tab rows are gone.
    expect(remaining).toHaveLength(2);
    expect(remaining.every((block) => block.pinnedAllTabs)).toBe(true);
    expect(remaining.every((block) => block.groupId === pinnedGroup)).toBe(true);
    expect(remaining.map((block) => block.viewport).sort()).toEqual([
      "mobile",
      "pc",
    ]);
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
