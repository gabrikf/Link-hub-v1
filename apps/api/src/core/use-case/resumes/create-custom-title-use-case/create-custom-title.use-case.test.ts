import { beforeEach, describe, expect, it } from "vitest";
import { TitleCatalogEntity } from "../../../entity/title-catalog/title-catalog-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CreateCustomTitleUseCase } from "./create-custom-title.use-case.js";

describe("CreateCustomTitleUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let titleCatalogRepository: InMemoryTitleCatalogRepository;
  let sut: CreateCustomTitleUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    titleCatalogRepository = new InMemoryTitleCatalogRepository();
    sut = new CreateCustomTitleUseCase(usersRepository, titleCatalogRepository);
  });

  it("should create custom title with normalized name", async () => {
    const user = UserEntity.create({
      email: "title@example.com",
      login: "title-user",
      name: "Title User",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      name: "  Staff Engineer  ",
    });

    expect(result.name).toBe("Staff Engineer");
    expect(result.normalizedName).toBe("staff engineer");
    expect(result.isDefault).toBe(false);
    expect(result.createdByUserId).toBe(user.id);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({ userId: "missing-user", name: "Staff Engineer" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when title already exists", async () => {
    const user = UserEntity.create({
      email: "title2@example.com",
      login: "title-user-2",
      name: "Title User 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    titleCatalogRepository.seed(
      TitleCatalogEntity.create({
        name: "Fullstack Engineer",
        normalizedName: "fullstack engineer",
        isDefault: true,
        createdByUserId: null,
      }),
    );

    await expect(
      sut.execute({ userId: user.id, name: "FULLSTACK ENGINEER" }),
    ).rejects.toBeInstanceOf(DuplicateResourceError);
  });
});
