import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BUILTIN_BLOCKS } from "@repo/schemas";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import { BadRequestError } from "../../../errors/index.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { InMemoryProfileTabsRepository } from "../../../repositories/profile-tab/in-memory-profile-tabs-repository.js";
import { InMemoryUnitOfWork } from "../../../providers/unit-of-work/in-memory-unit-of-work.js";
import { CreateBlockUseCase } from "./create-block.use-case.js";

describe("CreateBlockUseCase", () => {
  let tabsRepository: InMemoryProfileTabsRepository;
  let blocksRepository: InMemoryProfileBlocksRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let sut: CreateBlockUseCase;

  beforeEach(() => {
    tabsRepository = new InMemoryProfileTabsRepository();
    blocksRepository = new InMemoryProfileBlocksRepository();
    unitOfWork = new InMemoryUnitOfWork();
    sut = new CreateBlockUseCase(tabsRepository, blocksRepository, unitOfWork);
  });

  it("seeds the viewport and appends a full-width block in the first tab", async () => {
    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      config: { body: "Hello world" },
    });

    expect(block.kind).toBe("text");
    expect(block.gridW).toBe(12);
    expect(block.pinnedAllTabs).toBe(false);
    expect(block.tabId).not.toBeNull();
    // Appended below the seeded defaults. Derived from the schema constant so
    // this stays true whenever the default layout gains or loses a block.
    const lowestSeededRow = Math.max(
      ...DEFAULT_BUILTIN_BLOCKS.map((def) => def.gridY + def.gridH),
    );
    expect(block.gridY).toBe(lowestSeededRow);
  });

  it("creates a pinned block when tabId is null", async () => {
    const block = await sut.execute("user-1", {
      kind: "button",
      viewport: "pc",
      tabId: null,
      config: { label: "Download", url: "https://cv.dev" },
    });

    expect(block.tabId).toBeNull();
    expect(block.pinnedAllTabs).toBe(true);
  });

  it("mirrors the block into the other viewport with a shared groupId", async () => {
    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      config: { body: "Hello world" },
    });

    const pcBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "pc",
    );
    const mobileBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );

    const pcMatch = pcBlocks.find((b) => b.groupId === block.groupId);
    const mobileMatch = mobileBlocks.find((b) => b.groupId === block.groupId);

    expect(pcMatch).toBeDefined();
    expect(mobileMatch).toBeDefined();
    // Shared content, but each viewport keeps its own full width.
    expect(mobileMatch?.kind).toBe("text");
    expect(mobileMatch?.config).toEqual({ body: "Hello world" });
    expect(pcMatch?.gridW).toBe(12);
    expect(mobileMatch?.gridW).toBe(4);
    // Tabs are per-viewport, so the mirror lands in the MOBILE layout's own
    // default tab — never in the pc tab the block was created in.
    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    expect(mobileMatch?.pinnedAllTabs).toBe(false);
    expect(mobileMatch?.tabId).toBe(mobileTabs[0]?.id);
    expect(mobileMatch?.tabId).not.toBe(pcMatch?.tabId);
  });

  it("puts the mirror in the other viewport's default tab, not a counterpart of the chosen one", async () => {
    // Seed both viewports, then add a SECOND pc tab and create a block in it.
    await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      config: { body: "seed" },
    });

    const projects = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Projects",
      order: 1,
    });
    await tabsRepository.create(projects);

    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      tabId: projects.id,
      config: { body: "in projects" },
    });

    expect(block.tabId).toBe(projects.id);

    const mobileTabs = await tabsRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    // "Projects" exists on desktop only — the mobile layout keeps the one tab
    // the user actually created there.
    expect(mobileTabs).toHaveLength(1);

    const mobileBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    const mobileMatch = mobileBlocks.find((b) => b.groupId === block.groupId);
    expect(mobileMatch?.tabId).toBe(mobileTabs[0]?.id);
  });

  it("mirrors a pinned block as pinned in both viewports", async () => {
    const block = await sut.execute("user-1", {
      kind: "button",
      viewport: "pc",
      tabId: null,
      config: { label: "Download", url: "https://cv.dev" },
    });

    const mobileBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    const mobileMatch = mobileBlocks.find((b) => b.groupId === block.groupId);

    expect(mobileMatch?.pinnedAllTabs).toBe(true);
    expect(mobileMatch?.tabId).toBeNull();
  });

  it("applies client placement only to the edited viewport", async () => {
    // execute() seeds both viewports on first access, then inserts the block.
    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      config: { body: "Placed" },
      placement: { gridX: 2, gridY: 3, gridW: 6, gridH: 5 },
    });

    expect(block.gridX).toBe(2);
    expect(block.gridY).toBe(3);
    expect(block.gridW).toBe(6);
    expect(block.gridH).toBe(5);

    const mobileBlocks = await blocksRepository.findByUserAndViewport(
      "user-1",
      "mobile",
    );
    const mobileMatch = mobileBlocks.find((b) => b.groupId === block.groupId);
    // Mobile gets a computed default (full mobile width), NOT the pc placement.
    expect(mobileMatch?.gridW).toBe(4);
    expect(mobileMatch?.gridX).toBe(0);
  });

  it("respects an explicit placement", async () => {
    const tab = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(tab);

    const block = await sut.execute("user-1", {
      kind: "text",
      viewport: "pc",
      tabId: tab.id,
      config: { body: "Placed" },
      placement: { gridX: 2, gridY: 3, gridW: 6, gridH: 5 },
    });

    expect(block.gridX).toBe(2);
    expect(block.gridY).toBe(3);
    expect(block.gridW).toBe(6);
    expect(block.gridH).toBe(5);
  });

  it("rejects an unknown target tab", async () => {
    const tab = ProfileTabEntity.create({
      userId: "user-1",
      viewport: "pc",
      title: "Main",
      order: 0,
    });
    await tabsRepository.create(tab);

    await expect(
      sut.execute("user-1", {
        kind: "text",
        viewport: "pc",
        tabId: "missing-tab",
        config: { body: "x" },
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
