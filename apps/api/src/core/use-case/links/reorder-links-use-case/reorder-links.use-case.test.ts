import { beforeEach, describe, expect, it } from "vitest";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";
import { ReorderLinksUseCase } from "./reorder-links.use-case.js";

describe("ReorderLinksUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: ReorderLinksUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new ReorderLinksUseCase(linksRepository);
  });

  it("should reorder links by provided ids", async () => {
    const linkA = LinkEntity.create({
      userId: "user-1",
      title: "A",
      url: "https://a.dev",
      isPublic: true,
      order: 0,
    });

    const linkB = LinkEntity.create({
      userId: "user-1",
      title: "B",
      url: "https://b.dev",
      isPublic: true,
      order: 1,
    });

    await linksRepository.create(linkA);
    await linksRepository.create(linkB);

    const result = await sut.execute("user-1", [linkB.id, linkA.id]);

    const ordered = await linksRepository.findByUserId("user-1");

    expect(result.success).toBe(true);
    expect(ordered[0]?.id).toBe(linkB.id);
    expect(ordered[1]?.id).toBe(linkA.id);
  });

  it("should throw for empty list", async () => {
    await expect(sut.execute("user-1", [])).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("should throw when list contains ids outside user ownership", async () => {
    const link = LinkEntity.create({
      userId: "user-1",
      title: "A",
      url: "https://a.dev",
      isPublic: true,
      order: 0,
    });

    await linksRepository.create(link);

    await expect(
      sut.execute("user-1", [link.id, "foreign-link"]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
