import { beforeEach, describe, expect, it } from "vitest";
import { ListUserLinksUseCase } from "./list-user-links.use-case.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("ListUserLinksUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let sut: ListUserLinksUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    sut = new ListUserLinksUseCase(linksRepository);
  });

  it("lists only links from the given user ordered by position", async () => {
    const userLinkA = LinkEntity.create({
      userId: "user-1",
      title: "Second",
      url: "https://second.dev",
      isPublic: true,
      order: 1,
    });

    const userLinkB = LinkEntity.create({
      userId: "user-1",
      title: "First",
      url: "https://first.dev",
      isPublic: true,
      order: 0,
    });

    const otherUserLink = LinkEntity.create({
      userId: "user-2",
      title: "Other",
      url: "https://other.dev",
      isPublic: true,
      order: 0,
    });

    await linksRepository.create(userLinkA);
    await linksRepository.create(userLinkB);
    await linksRepository.create(otherUserLink);

    const result = await sut.execute("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(userLinkB.id);
    expect(result[1].id).toBe(userLinkA.id);
  });

  it("returns an empty list when user has no links", async () => {
    const result = await sut.execute("missing-user");

    expect(result).toEqual([]);
  });
});
