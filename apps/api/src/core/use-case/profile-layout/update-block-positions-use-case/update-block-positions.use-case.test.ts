import { beforeEach, describe, expect, it } from "vitest";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import { BadRequestError } from "../../../errors/index.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { UpdateBlockPositionsUseCase } from "./update-block-positions.use-case.js";

describe("UpdateBlockPositionsUseCase", () => {
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: UpdateBlockPositionsUseCase;

  beforeEach(() => {
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new UpdateBlockPositionsUseCase(blocksRepository);
  });

  async function seedBlock(
    userId = "user-1",
    viewport: "pc" | "mobile" = "pc",
  ) {
    const block = ProfileBlockEntity.create({
      userId,
      viewport,
      tabId: null,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: { body: "x" },
    });
    await blocksRepository.create(block);
    return block;
  }

  it("persists new positions for owned blocks", async () => {
    const block = await seedBlock();

    const result = await sut.execute("user-1", {
      viewport: "pc",
      positions: [{ id: block.id, gridX: 3, gridY: 2, gridW: 6, gridH: 8 }],
    });

    expect(result.success).toBe(true);
    const updated = await blocksRepository.findById(block.id);
    expect(updated?.gridX).toBe(3);
    expect(updated?.gridY).toBe(2);
    expect(updated?.gridW).toBe(6);
    expect(updated?.gridH).toBe(8);
  });

  it("persists coordinates for one viewport without affecting the other", async () => {
    const pcBlock = await seedBlock("user-1", "pc");
    const mobileBlock = await seedBlock("user-1", "mobile");

    await sut.execute("user-1", {
      viewport: "pc",
      positions: [{ id: pcBlock.id, gridX: 5, gridY: 6, gridW: 3, gridH: 2 }],
    });

    const updatedPc = await blocksRepository.findById(pcBlock.id);
    expect(updatedPc?.gridX).toBe(5);
    expect(updatedPc?.gridY).toBe(6);
    expect(updatedPc?.gridW).toBe(3);
    expect(updatedPc?.gridH).toBe(2);

    // The mobile block for the same user must be untouched.
    const untouchedMobile = await blocksRepository.findById(mobileBlock.id);
    expect(untouchedMobile?.gridX).toBe(0);
    expect(untouchedMobile?.gridY).toBe(0);
    expect(untouchedMobile?.gridW).toBe(12);
    expect(untouchedMobile?.gridH).toBe(4);
  });

  it("throws when a position references a foreign block", async () => {
    const block = await seedBlock();

    await expect(
      sut.execute("user-1", {
        viewport: "pc",
        positions: [
          { id: block.id, gridX: 0, gridY: 0, gridW: 12, gridH: 4 },
          { id: "foreign", gridX: 0, gridY: 0, gridW: 12, gridH: 4 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects a position that references a block owned by another user", async () => {
    await seedBlock("user-1", "pc");
    const otherUsersBlock = await seedBlock("user-2", "pc");

    await expect(
      sut.execute("user-1", {
        viewport: "pc",
        positions: [
          { id: otherUsersBlock.id, gridX: 1, gridY: 1, gridW: 2, gridH: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    // The foreign block must remain at its seeded coordinates.
    const stored = await blocksRepository.findById(otherUsersBlock.id);
    expect(stored?.gridX).toBe(0);
    expect(stored?.gridY).toBe(0);
  });

  it("rejects positions that belong to the user but in a different viewport", async () => {
    const mobileBlock = await seedBlock("user-1", "mobile");

    // Same owner, but the block lives in the mobile viewport — updating pc
    // must not accept a mobile block id.
    await expect(
      sut.execute("user-1", {
        viewport: "pc",
        positions: [
          { id: mobileBlock.id, gridX: 1, gridY: 1, gridW: 2, gridH: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
