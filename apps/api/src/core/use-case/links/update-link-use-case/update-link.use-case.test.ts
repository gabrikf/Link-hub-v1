import { beforeEach, describe, expect, it } from "vitest";
import { UpdateLinkUseCase } from "./update-link.use-case.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("UpdateLinkUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: UpdateLinkUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new UpdateLinkUseCase(linksRepository);
  });

  it("updates title, url and visibility when link belongs to user", async () => {
    const link = LinkEntity.create({
      userId: "user-1",
      title: "Old",
      url: "https://old.dev",
      isPublic: false,
      order: 0,
    });

    await linksRepository.create(link);

    const result = await sut.execute({
      userId: "user-1",
      linkId: link.id,
      title: "New",
      url: "https://new.dev",
      isPublic: true,
    });

    expect(result.title).toBe("New");
    expect(result.url).toBe("https://new.dev");
    expect(result.isPublic).toBe(true);
  });

  it("throws when link does not exist", async () => {
    await expect(
      sut.execute({
        userId: "user-1",
        linkId: "missing-link",
        title: "New",
        url: "https://new.dev",
        isPublic: true,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("throws when user does not own the link", async () => {
    const link = LinkEntity.create({
      userId: "owner-user",
      title: "Owner Link",
      url: "https://owner.dev",
      isPublic: true,
      order: 0,
    });

    await linksRepository.create(link);

    await expect(
      sut.execute({
        userId: "other-user",
        linkId: link.id,
        title: "Try Update",
        url: "https://changed.dev",
        isPublic: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
