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
import { UpdateBlockUseCase } from "./update-block.use-case.js";

describe("UpdateBlockUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let sut: UpdateBlockUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
    sut = new UpdateBlockUseCase(tabsRepository, blocksRepository, unitOfWork);
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

  async function seedMirroredTab(userId = "user-1") {
    const groupId = crypto.randomUUID();
    const pc = ProfileTabEntity.create({
      userId,
      groupId,
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    const mobile = ProfileTabEntity.create({
      userId,
      groupId,
      viewport: "mobile",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(pc);
    await tabsRepository.create(mobile);
    return { pc, mobile };
  }

  async function seedMirroredBlock(
    pcTabId: string | null,
    mobileTabId: string | null,
    userId = "user-1",
  ) {
    const groupId = crypto.randomUUID();
    const pc = ProfileBlockEntity.create({
      userId,
      groupId,
      viewport: "pc",
      tabId: pcTabId,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: { body: "original" },
    });
    const mobile = ProfileBlockEntity.create({
      userId,
      groupId,
      viewport: "mobile",
      tabId: mobileTabId,
      kind: "text",
      // Distinct position to prove positions are preserved across an update.
      gridX: 1,
      gridY: 7,
      gridW: 4,
      gridH: 4,
      config: { body: "original" },
    });
    await blocksRepository.create(pc);
    await blocksRepository.create(mobile);
    return { pc, mobile };
  }

  it("mirrors a config edit to both viewports without touching positions", async () => {
    const { pc: pcTab, mobile: mobileTab } = await seedMirroredTab();
    const { pc, mobile } = await seedMirroredBlock(pcTab.id, mobileTab.id);

    await sut.execute("user-1", pc.id, { config: { body: "updated" } });

    const pcRow = await blocksRepository.findById(pc.id);
    const mobileRow = await blocksRepository.findById(mobile.id);

    expect(pcRow?.config).toEqual({ body: "updated" });
    expect(mobileRow?.config).toEqual({ body: "updated" });
    // Positions stay per-viewport (mobile keeps its distinct coordinates).
    expect(mobileRow?.gridX).toBe(1);
    expect(mobileRow?.gridY).toBe(7);
    expect(mobileRow?.gridW).toBe(4);
    expect(pcRow?.gridW).toBe(12);
  });

  it("mirrors a visibility toggle to both viewports", async () => {
    const { pc: pcTab, mobile: mobileTab } = await seedMirroredTab();
    const { pc, mobile } = await seedMirroredBlock(pcTab.id, mobileTab.id);

    await sut.execute("user-1", pc.id, { isVisible: false });

    expect((await blocksRepository.findById(pc.id))?.isVisible).toBe(false);
    expect((await blocksRepository.findById(mobile.id))?.isVisible).toBe(false);
  });

  it("mirrors a pin toggle to both viewports", async () => {
    const { pc: pcTab, mobile: mobileTab } = await seedMirroredTab();
    const { pc, mobile } = await seedMirroredBlock(pcTab.id, mobileTab.id);

    await sut.execute("user-1", pc.id, { pinnedAllTabs: true });

    const pcRow = await blocksRepository.findById(pc.id);
    const mobileRow = await blocksRepository.findById(mobile.id);
    expect(pcRow?.pinnedAllTabs).toBe(true);
    expect(pcRow?.tabId).toBeNull();
    expect(mobileRow?.pinnedAllTabs).toBe(true);
    expect(mobileRow?.tabId).toBeNull();
  });

  it("mirrors an unpin, resolving each viewport's own tab row", async () => {
    const { pc: pcTab, mobile: mobileTab } = await seedMirroredTab();
    const { pc, mobile } = await seedMirroredBlock(null, null);

    const result = await sut.execute("user-1", pc.id, {
      pinnedAllTabs: false,
    });

    // The returned (pc) row anchors to the pc tab; the mobile mirror anchors to
    // the mobile tab of the SAME group — not the pc tab id.
    expect(result.tabId).toBe(pcTab.id);
    const mobileRow = await blocksRepository.findById(mobile.id);
    expect(mobileRow?.tabId).toBe(mobileTab.id);
    expect(mobileRow?.pinnedAllTabs).toBe(false);
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
