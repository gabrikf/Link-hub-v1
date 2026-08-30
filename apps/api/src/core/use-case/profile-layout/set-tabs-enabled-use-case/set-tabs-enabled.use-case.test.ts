import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { SetTabsEnabledUseCase } from "./set-tabs-enabled.use-case.js";

describe("SetTabsEnabledUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let sut: SetTabsEnabledUseCase;

  /**
   * Seeds a user with BOTH viewports' tab strips already on, stated explicitly.
   *
   * The independence tests below are about one write not leaking into the other
   * viewport, so they need a starting state where both are on and a flip is
   * visible. That used to come from the entity's normalization default; it is
   * spelled out here now that a brand-new account starts with both OFF
   * (`DEFAULT_TABS_ENABLED`), which the first test covers on its own.
   */
  async function seedUser(
    props: { tabsEnabledPc?: boolean; tabsEnabledMobile?: boolean } = {
      tabsEnabledPc: true,
      tabsEnabledMobile: true,
    },
  ) {
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
      tabsEnabledPc: props.tabsEnabledPc,
      tabsEnabledMobile: props.tabsEnabledMobile,
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

  /*
   * The new-account default, at the smallest scope that can show it. A fresh
   * profile publishes the always-visible zone only — photo, name and links —
   * so both viewports start with their tab strip OFF. This test used to assert
   * the opposite; it encoded the old default.
   */
  it("starts a brand-new account with both viewports' tabs off", async () => {
    const user = await seedUser({});

    expect(user.tabsEnabledPc).toBe(false);
    expect(user.tabsEnabledMobile).toBe(false);
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
