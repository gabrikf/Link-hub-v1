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
      description: "Building CraftHub",
    });

    expect(result.username).toBe("gabriel");
    expect(result.name).toBe("Gabriel");
    expect(result.description).toBe("Building CraftHub");
  });

  it("should persist and round-trip ALL profile fields (guards the dropped .set() bug)", async () => {
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
      description: "Building CraftHub",
      backgroundImageUrl: "https://cdn.example.com/bg.png",
      bannerImageUrl: "https://cdn.example.com/banner.png",
      themeAccent: "#ff0066",
      themePreset: "midnight",
      openToWork: true,
      location: "Lisbon, PT",
      persona: "developer",
    });

    // Every new field must be reflected in the returned DTO...
    expect(result.backgroundImageUrl).toBe("https://cdn.example.com/bg.png");
    expect(result.bannerImageUrl).toBe("https://cdn.example.com/banner.png");
    expect(result.themeAccent).toBe("#ff0066");
    expect(result.themePreset).toBe("midnight");
    expect(result.openToWork).toBe(true);
    expect(result.location).toBe("Lisbon, PT");
    expect(result.persona).toBe("developer");

    // ...AND actually persisted on the stored entity (round-trip).
    const stored = await usersRepository.findById(user.id);
    expect(stored?.backgroundImageUrl).toBe("https://cdn.example.com/bg.png");
    expect(stored?.bannerImageUrl).toBe("https://cdn.example.com/banner.png");
    expect(stored?.themeAccent).toBe("#ff0066");
    expect(stored?.themePreset).toBe("midnight");
    expect(stored?.openToWork).toBe(true);
    expect(stored?.location).toBe("Lisbon, PT");
    expect(stored?.persona).toBe("developer");
  });

  it("clears nullable profile fields when explicitly set to null", async () => {
    const user = UserEntity.create({
      email: "dev2@example.com",
      login: "dev2",
      name: "Developer 2",
      password: "hashed-password",
      description: "old",
      avatarUrl: null,
      backgroundImageUrl: "https://cdn.example.com/old-bg.png",
      themeAccent: "#000000",
      location: "Somewhere",
      persona: "designer",
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      username: "dev2",
      backgroundImageUrl: null,
      themeAccent: null,
      location: null,
      persona: null,
    });

    expect(result.backgroundImageUrl).toBeNull();
    expect(result.themeAccent).toBeNull();
    expect(result.location).toBeNull();
    expect(result.persona).toBeNull();
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
