import { beforeEach, describe, expect, it } from "vitest";
import { GetMeProfileUseCase } from "./get-me-profile.use-case.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";

describe("GetMeProfileUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let linksRepository: InMemoryLinksRepository;
  let sut: GetMeProfileUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    linksRepository = new InMemoryLinksRepository();
    sut = new GetMeProfileUseCase(usersRepository, linksRepository);
  });

  it("returns user profile and all user links", async () => {
    const user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Developer",
      password: "hashed-password",
      description: "Building products",
      avatarUrl: "https://example.com/avatar.jpg",
      googleId: null,
    });

    const link = LinkEntity.create({
      userId: user.id,
      title: "Portfolio",
      url: "https://portfolio.dev",
      isPublic: false,
      order: 0,
    });

    await usersRepository.create(user);
    await linksRepository.create(link);

    const result = await sut.execute(user.id);

    expect(result.username).toBe("dev");
    expect(result.name).toBe("Developer");
    expect(result.description).toBe("Building products");
    expect(result.userPhoto).toBe("https://example.com/avatar.jpg");
    expect(result.links).toHaveLength(1);
    expect(result.links[0].id).toBe(link.id);
  });

  it("throws when user does not exist", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
