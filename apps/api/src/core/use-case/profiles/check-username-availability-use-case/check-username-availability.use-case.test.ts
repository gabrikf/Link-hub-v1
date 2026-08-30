import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { CheckUsernameAvailabilityUseCase } from "./check-username-availability.use-case.js";

/**
 * The rule this encodes: the check must agree with the SAVE. Anything it calls
 * free must survive `PUT /profile`, and anything the save would reject it has
 * to call unavailable — with the reason, because "taken" and "reserved" are
 * different problems for the person typing.
 */
describe("CheckUsernameAvailabilityUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let sut: CheckUsernameAvailabilityUseCase;

  const seed = async (login: string) =>
    usersRepository.create(
      UserEntity.create({
        email: `${login}@example.com`,
        login,
        name: login,
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
      }),
    );

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    sut = new CheckUsernameAvailabilityUseCase(usersRepository);
  });

  it("is available when nobody holds it", async () => {
    expect(await sut.execute("mariana")).toEqual({
      username: "mariana",
      isAvailable: true,
      reason: null,
    });
  });

  it("is taken when another account holds it", async () => {
    await seed("mariana");

    expect(await sut.execute("mariana")).toEqual({
      username: "mariana",
      isAvailable: false,
      reason: "taken",
    });
  });

  /**
   * The check runs while somebody edits their own profile, so the handle in the
   * field starts out as theirs. Calling that taken would tell a person their
   * own name is unavailable and block a form they never changed — while the
   * save would have accepted it, since `UpdateProfileUseCase` skips the
   * duplicate lookup when the username has not moved.
   */
  it("is available to the account that already owns it", async () => {
    const owner = await seed("mariana");

    expect(await sut.execute("mariana", owner.id)).toEqual({
      username: "mariana",
      isAvailable: true,
      reason: null,
    });
  });

  it("is still taken for a DIFFERENT signed-in account", async () => {
    await seed("mariana");
    const someoneElse = await seed("ada");

    expect(await sut.execute("mariana", someoneElse.id)).toMatchObject({
      isAvailable: false,
      reason: "taken",
    });
  });

  /**
   * Nobody holds `dashboard` and nobody ever can: `updateProfileSchemaInput`
   * refuses it before any repository is touched. Reporting it free would send
   * the user into a Save that fails for a reason the form never mentioned.
   */
  it.each(["dashboard", "settings", "login", "admin", "verify-email"])(
    "reports the reserved name %s as unavailable, with its own reason",
    async (login) => {
      expect(await sut.execute(login)).toEqual({
        username: login,
        isAvailable: false,
        reason: "reserved",
      });
    },
  );

  /** The blocklist is case-insensitive, so the verdict has to be too. */
  it("reports a reserved name as reserved whatever its case", async () => {
    expect(await sut.execute("DashBoard")).toMatchObject({
      isAvailable: false,
      reason: "reserved",
    });
  });
});
