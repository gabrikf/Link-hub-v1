import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { SetTabsEnabledUseCase } from "./set-tabs-enabled.use-case.js";

describe("SetTabsEnabledUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let sut: SetTabsEnabledUseCase;

  async function seedUser() {
    const now = new Date();
    const user = new UserEntity({
      id: "user-1",
      email: "user-1@example.com",
      login: "user-1",
      name: "User One",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
      createdAt: now,
      updatedAt: now,
    });
    await usersRepository.create(user);
    return user;
  }

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    sut = new SetTabsEnabledUseCase(usersRepository);
  });

  it("starts both viewports enabled", async () => {
    const user = await seedUser();

    expect(user.tabsEnabledPc).toBe(true);
    expect(user.tabsEnabledMobile).toBe(true);
  });

  /*
   * The reported bug, at the smallest scope that can show it: with one shared
   * column these two tests cannot both pass.
   */
  it("writing pc leaves mobile alone", async () => {
    await seedUser();

    await sut.execute("user-1", { viewport: "pc", tabsEnabled: false });

    const stored = await usersRepository.findById("user-1");
    expect(stored?.tabsEnabledPc).toBe(false);
    expect(stored?.tabsEnabledMobile).toBe(true);
  });

  it("writing mobile leaves pc alone", async () => {
    await seedUser();

    await sut.execute("user-1", { viewport: "mobile", tabsEnabled: false });

    const stored = await usersRepository.findById("user-1");
    expect(stored?.tabsEnabledPc).toBe(true);
    expect(stored?.tabsEnabledMobile).toBe(false);
  });

  it("holds two viewports at different values at the same time", async () => {
    await seedUser();

    await sut.execute("user-1", { viewport: "pc", tabsEnabled: false });
    await sut.execute("user-1", { viewport: "mobile", tabsEnabled: true });

    const stored = await usersRepository.findById("user-1");
    expect(stored?.tabsEnabledPc).toBe(false);
    expect(stored?.tabsEnabledMobile).toBe(true);
  });

  it("echoes the viewport it wrote and the value it stored", async () => {
    await seedUser();

    const result = await sut.execute("user-1", {
      viewport: "mobile",
      tabsEnabled: false,
    });

    expect(result).toEqual({ viewport: "mobile", tabsEnabled: false });
  });

  it("is idempotent — setting the same value twice changes nothing else", async () => {
    await seedUser();

    await sut.execute("user-1", { viewport: "pc", tabsEnabled: false });
    await sut.execute("user-1", { viewport: "pc", tabsEnabled: false });

    const stored = await usersRepository.findById("user-1");
    expect(stored?.tabsEnabledPc).toBe(false);
    expect(stored?.tabsEnabledMobile).toBe(true);
  });

  it("rejects an unknown user", async () => {
    await expect(
      sut.execute("nobody", { viewport: "pc", tabsEnabled: false }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
