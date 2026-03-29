import { beforeEach, describe, expect, it } from "vitest";
import { GetPublicProfileUseCase } from "./get-public-profile.use-case.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("GetPublicProfileUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let linksRepository: InMemoryLinksRepository;
  let sut: GetPublicProfileUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    linksRepository = new InMemoryLinksRepository();
    sut = new GetPublicProfileUseCase(usersRepository, linksRepository);
  });

  it("returns profile with only public links", async () => {
    const user = UserEntity.create({
      email: "public@example.com",
      login: "public-user",
      name: "Public User",
      password: "hashed-password",
      description: "Open profile",
      avatarUrl: "https://example.com/public.png",
      googleId: null,
    });

    const publicLink = LinkEntity.create({
      userId: user.id,
      title: "Public",
      url: "https://public.dev",
      isPublic: true,
      order: 0,
    });

    const privateLink = LinkEntity.create({
      userId: user.id,
      title: "Private",
      url: "https://private.dev",
      isPublic: false,
      order: 1,
    });

    await usersRepository.create(user);
    await linksRepository.create(publicLink);
    await linksRepository.create(privateLink);

    const result = await sut.execute("public-user");

    expect(result.username).toBe("public-user");
    expect(result.name).toBe("Public User");
    expect(result.description).toBe("Open profile");
    expect(result.userPhoto).toBe("https://example.com/public.png");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].id).toBe(publicLink.id);
  });

  it("throws when username is not found", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
