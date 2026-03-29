import { beforeEach, describe, expect, it } from "vitest";
import { ToggleLinkVisibilityUseCase } from "./toggle-link-visibility.use-case.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("ToggleLinkVisibilityUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: ToggleLinkVisibilityUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new ToggleLinkVisibilityUseCase(linksRepository);
  });

  it("updates link visibility for the owner", async () => {
    const link = LinkEntity.create({
      userId: "user-1",
      title: "Hidden",
      url: "https://example.com",
      isPublic: false,
      order: 0,
    });

    await linksRepository.create(link);

    const result = await sut.execute("user-1", link.id, true);

    expect(result.isPublic).toBe(true);

    const updated = await linksRepository.findById(link.id);
    expect(updated?.isPublic).toBe(true);
  });

  it("throws when isPublic is not boolean", async () => {
    await expect(
      sut.execute("user-1", "link-id", "true" as unknown as boolean),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("throws when link does not exist", async () => {
    await expect(
      sut.execute("user-1", "missing-link", true),
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
      sut.execute("other-user", link.id, false),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
