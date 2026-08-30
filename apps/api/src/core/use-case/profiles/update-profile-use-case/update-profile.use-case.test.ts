import { DEFAULT_PROFILE_APPEARANCE } from "@repo/schemas";
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

  /**
   * Banner / background placement, i.e. "which part of my photo shows".
   *
   * `undefined` and `null` are DIFFERENT here in a way they are not for the
   * other nullable fields: absent means "leave the stored appearance alone",
   * and there is no way to express "clear it" because a cleared appearance is
   * just the default one.
   */
  describe("appearance", () => {
    const makeUser = async () => {
      const user = UserEntity.create({
        email: "mariana@example.com",
        login: "mariana",
        name: "Mariana",
        password: "hashed-password",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(user);
      return user;
    };

    it("gives an account that never touched it the documented default", async () => {
      const user = await makeUser();

      const result = await sut.execute({ userId: user.id, username: "mariana" });

      expect(result.appearance).toEqual(DEFAULT_PROFILE_APPEARANCE);
    });

    it("round-trips a placement and a background treatment", async () => {
      const user = await makeUser();
      const appearance = {
        bannerPlacement: { x: 50, y: 18, scale: 1.2 },
        backgroundPlacement: { x: 25, y: 70, scale: 1 },
        backgroundOverlay: 30,
        backgroundBlur: 12,
      };

      const result = await sut.execute({
        userId: user.id,
        username: "mariana",
        appearance,
      });

      expect(result.appearance).toEqual(appearance);

      const stored = await usersRepository.findById(user.id);
      expect(stored?.appearance).toEqual(appearance);
    });

    it("leaves a stored appearance alone when the field is absent", async () => {
      const user = await makeUser();
      const appearance = {
        ...DEFAULT_PROFILE_APPEARANCE,
        bannerPlacement: { x: 10, y: 90, scale: 2 },
      };
      await sut.execute({ userId: user.id, username: "mariana", appearance });

      // A save from a screen that knows nothing about appearance — the layout
      // studio, a future settings panel — must not silently re-centre a banner.
      const result = await sut.execute({
        userId: user.id,
        username: "mariana",
        name: "Mariana M. Freitas",
      });

      expect(result.appearance).toEqual(appearance);
    });

    it("refuses an out-of-range placement instead of storing it", async () => {
      const user = await makeUser();

      // The HTTP boundary rejects this first; the entity re-parses so a caller
      // that bypasses the route (a script, a future internal call) cannot write
      // a value the renderer would have to defend against.
      const result = await sut.execute({
        userId: user.id,
        username: "mariana",
        appearance: {
          bannerPlacement: { x: 5000, y: -3, scale: 40 },
          backgroundPlacement: null,
          backgroundOverlay: 400,
          backgroundBlur: 900,
        },
      });

      expect(result.appearance).toEqual(DEFAULT_PROFILE_APPEARANCE);
    });
  });
});
