import { beforeEach, describe, expect, it } from "vitest";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryProfileBlocksRepository } from "../../../repositories/profile-block/in-memory-profile-block-repository.js";
import { DeleteBlockUseCase } from "./delete-block.use-case.js";

describe("DeleteBlockUseCase", () => {
  let blocksRepository: InMemoryProfileBlocksRepository;
  let sut: DeleteBlockUseCase;

  beforeEach(() => {
    blocksRepository = new InMemoryProfileBlocksRepository();
    sut = new DeleteBlockUseCase(blocksRepository);
  });

  function makeBlock(kind: "text" | "header", userId = "user-1") {
    return ProfileBlockEntity.create({
      userId,
      viewport: "pc",
      tabId: null,
      kind,
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: kind === "text" ? { body: "x" } : null,
    });
  }

  it("deletes a custom block", async () => {
    const block = makeBlock("text");
    await blocksRepository.create(block);

    const result = await sut.execute("user-1", block.id);

    expect(result.success).toBe(true);
    expect(await blocksRepository.findById(block.id)).toBeNull();
  });

  it("deletes the mirrored row in the other viewport too", async () => {
    const groupId = crypto.randomUUID();
    const pc = ProfileBlockEntity.create({
      userId: "user-1",
      groupId,
      viewport: "pc",
      tabId: null,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      config: { body: "x" },
    });
    const mobile = ProfileBlockEntity.create({
      userId: "user-1",
      groupId,
      viewport: "mobile",
      tabId: null,
      kind: "text",
      gridX: 0,
      gridY: 0,
      gridW: 4,
      gridH: 4,
      config: { body: "x" },
    });
    await blocksRepository.create(pc);
    await blocksRepository.create(mobile);

    // Deleting via the pc row must remove the mobile mirror as well.
    await sut.execute("user-1", pc.id);

    expect(await blocksRepository.findById(pc.id)).toBeNull();
    expect(await blocksRepository.findById(mobile.id)).toBeNull();
    expect(blocksRepository.getAll()).toHaveLength(0);
  });

  it("refuses to delete a built-in block", async () => {
    const block = makeBlock("header");
    await blocksRepository.create(block);

    await expect(sut.execute("user-1", block.id)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("throws when the block is not found", async () => {
    await expect(sut.execute("user-1", "missing")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("throws when the block belongs to another user", async () => {
    const block = makeBlock("text", "other-user");
    await blocksRepository.create(block);

    await expect(sut.execute("user-1", block.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
