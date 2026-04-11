import { beforeEach, describe, expect, it } from "vitest";
import { SkillCatalogEntity } from "../../../entity/skill-catalog/skill-catalog-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CreateCustomSkillUseCase } from "./create-custom-skill.use-case.js";

describe("CreateCustomSkillUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let skillCatalogRepository: InMemorySkillCatalogRepository;
  let sut: CreateCustomSkillUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    skillCatalogRepository = new InMemorySkillCatalogRepository();
    sut = new CreateCustomSkillUseCase(usersRepository, skillCatalogRepository);
  });

  it("should create custom skill with normalized name", async () => {
    const user = UserEntity.create({
      email: "skill@example.com",
      login: "skill-user",
      name: "Skill User",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      name: "  React Native  ",
    });

    expect(result.name).toBe("React Native");
    expect(result.normalizedName).toBe("react native");
    expect(result.isDefault).toBe(false);
    expect(result.createdByUserId).toBe(user.id);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({ userId: "missing-user", name: "React" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when skill name already exists", async () => {
    const user = UserEntity.create({
      email: "skill2@example.com",
      login: "skill-user-2",
      name: "Skill User 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    skillCatalogRepository.seed(
      SkillCatalogEntity.create({
        name: "React",
        normalizedName: "react",
        isDefault: true,
        createdByUserId: null,
      }),
    );

    await expect(
      sut.execute({ userId: user.id, name: "  REACT  " }),
    ).rejects.toBeInstanceOf(DuplicateResourceError);
  });
});
