import { beforeEach, describe, expect, it } from "vitest";
import { DeleteLinkUseCase } from "./delete-link.use-case.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("DeleteLinkUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: DeleteLinkUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new DeleteLinkUseCase(linksRepository);
  });

  it("deletes a link when it belongs to the user", async () => {
    const link = LinkEntity.create({
      userId: "user-1",
      title: "Portfolio",
      url: "https://example.com",
      isPublic: true,
      order: 0,
    });

    await linksRepository.create(link);

    const result = await sut.execute("user-1", link.id);

    const deleted = await linksRepository.findById(link.id);
    expect(result.success).toBe(true);
    expect(deleted).toBeNull();
  });

  it("throws when link does not exist", async () => {
    await expect(sut.execute("user-1", "missing-link")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("throws when link belongs to another user", async () => {
    const link = LinkEntity.create({
      userId: "owner-user",
      title: "Secret",
      url: "https://example.com/secret",
      isPublic: false,
      order: 0,
    });

    await linksRepository.create(link);

    await expect(sut.execute("other-user", link.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
