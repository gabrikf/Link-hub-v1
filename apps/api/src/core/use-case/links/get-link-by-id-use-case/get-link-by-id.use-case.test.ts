import { beforeEach, describe, expect, it } from "vitest";
import { GetLinkByIdUseCase } from "./get-link-by-id.use-case.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("GetLinkByIdUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: GetLinkByIdUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new GetLinkByIdUseCase(linksRepository);
  });

  it("returns link when it belongs to the user", async () => {
    const link = LinkEntity.create({
      userId: "user-1",
      title: "Blog",
      url: "https://blog.example.com",
      isPublic: true,
      order: 0,
    });

    await linksRepository.create(link);

    const result = await sut.execute("user-1", link.id);

    expect(result.id).toBe(link.id);
    expect(result.title).toBe("Blog");
  });

  it("throws when link does not exist", async () => {
    await expect(sut.execute("user-1", "missing-link")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("throws when link belongs to another user", async () => {
    const link = LinkEntity.create({
      userId: "owner-user",
      title: "Private Link",
      url: "https://private.example.com",
      isPublic: false,
      order: 0,
    });

    await linksRepository.create(link);

    await expect(sut.execute("other-user", link.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
