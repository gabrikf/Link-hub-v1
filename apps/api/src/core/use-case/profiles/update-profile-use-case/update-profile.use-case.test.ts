import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { UpdateProfileUseCase } from "./update-profile.use-case.js";

describe("UpdateProfileUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let sut: UpdateProfileUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    sut = new UpdateProfileUseCase(usersRepository);
  });

  it("should update username, name and description", async () => {
    const user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Developer",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      username: "gabriel",
      name: "Gabriel",
      description: "Building LinkHub",
    });

    expect(result.username).toBe("gabriel");
    expect(result.name).toBe("Gabriel");
    expect(result.description).toBe("Building LinkHub");
  });

  it("should throw when username is already in use", async () => {
    const firstUser = UserEntity.create({
      email: "first@example.com",
      login: "first",
      name: "First",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    const secondUser = UserEntity.create({
      email: "second@example.com",
      login: "second",
      name: "Second",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(firstUser);
    await usersRepository.create(secondUser);

    await expect(
      sut.execute({
        userId: secondUser.id,
        username: "first",
        name: "Second",
        description: null,
      }),
    ).rejects.toBeInstanceOf(DuplicateResourceError);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({
        userId: "missing",
        username: "ghost",
        name: "Ghost",
        description: null,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
