import { beforeEach, describe, expect, it } from "vitest";
import { LinkEntity } from "../../../entity/link/link-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CreateLinkUseCase } from "./create-link.use-case.js";

describe("CreateLinkUseCase", () => {
  let linksRepository: InMemoryLinksRepository;
  let usersRepository: InMemoryUsersRepository;
  let sut: CreateLinkUseCase;

  beforeEach(() => {
    linksRepository = new InMemoryLinksRepository();
    usersRepository = new InMemoryUsersRepository();
    sut = new CreateLinkUseCase(linksRepository, usersRepository);
  });

  it("should create a link with order zero when user has no links", async () => {
    const user = UserEntity.create({
      email: "test@example.com",
      login: "tester",
      name: "Test User",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const created = await sut.execute({
      userId: user.id,
      title: "Portfolio",
      url: "https://example.com",
      isPublic: true,
    });

    expect(created.title).toBe("Portfolio");
    expect(created.order).toBe(0);
  });

  it("should increment order from last existing link", async () => {
    const user = UserEntity.create({
      email: "test2@example.com",
      login: "tester2",
      name: "Test User 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    await linksRepository.create(
      LinkEntity.create({
        userId: user.id,
        title: "First",
        url: "https://one.dev",
        isPublic: true,
        order: 4,
      }),
    );

    const created = await sut.execute({
      userId: user.id,
      title: "Second",
      url: "https://two.dev",
      isPublic: false,
    });

    expect(created.order).toBe(5);
    expect(created.isPublic).toBe(false);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({
        userId: "missing-user",
        title: "Broken",
        url: "https://broken.dev",
        isPublic: true,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
