import { beforeEach, describe, expect, it } from "vitest";
import { profileSchema } from "@repo/schemas";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InMemoryLinksRepository } from "../../../repositories/link/in-memory-links-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { GetMeProfileUseCase } from "../get-me-profile-use-case/get-me-profile.use-case.js";
import { UpdateProfileUseCase } from "./update-profile.use-case.js";

/**
 * `persona` is a closed enum, so the eight categories cover most people and
 * nobody else. The free-text label is what a physiotherapist gets instead of
 * being filed under "Other" forever — these cover it surviving a write, coming
 * back on the read, and being cleared the moment persona stops being "other".
 */
describe("UpdateProfileUseCase — the custom role label", () => {
  let usersRepository: InMemoryUsersRepository;
  let linksRepository: InMemoryLinksRepository;
  let sut: UpdateProfileUseCase;
  let readProfile: GetMeProfileUseCase;

  const seedUser = async () => {
    const user = UserEntity.create({
      email: "ada@example.com",
      login: "ada",
      name: "Ada",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);
    return user;
  };

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    linksRepository = new InMemoryLinksRepository();
    sut = new UpdateProfileUseCase(usersRepository);
    readProfile = new GetMeProfileUseCase(usersRepository, linksRepository);
  });

  it("persists the custom label and returns it on the profile read", async () => {
    const user = await seedUser();

    const saved = await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    expect(saved.persona).toBe("other");
    expect(saved.personaOther).toBe("Fisioterapeuta");

    const stored = await usersRepository.findById(user.id);
    expect(stored?.personaOther).toBe("Fisioterapeuta");

    const read = await readProfile.execute(user.id);
    expect(read.personaOther).toBe("Fisioterapeuta");
    // And the read payload is still what the shared contract describes.
    expect(profileSchema.parse(read).personaOther).toBe("Fisioterapeuta");
  });

  it("clears the label when the user switches to a named persona", async () => {
    const user = await seedUser();

    await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    // The client sends only the new persona — the stale label must not survive
    // just because nobody remembered to null it out.
    const switched = await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "developer",
    });

    expect(switched.persona).toBe("developer");
    expect(switched.personaOther).toBeNull();
    expect((await usersRepository.findById(user.id))?.personaOther).toBeNull();
  });

  it("clears the label when the persona is cleared entirely", async () => {
    const user = await seedUser();

    await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    const cleared = await sut.execute({
      userId: user.id,
      username: "ada",
      persona: null,
    });

    expect(cleared.persona).toBeNull();
    expect(cleared.personaOther).toBeNull();
  });

  it("keeps the label when an unrelated field is updated", async () => {
    const user = await seedUser();

    await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    const renamed = await sut.execute({
      userId: user.id,
      username: "ada",
      name: "Ada Lovelace",
    });

    expect(renamed.name).toBe("Ada Lovelace");
    expect(renamed.personaOther).toBe("Fisioterapeuta");
  });

  it("lets the user edit the label without resending the persona", async () => {
    const user = await seedUser();

    await sut.execute({
      userId: user.id,
      username: "ada",
      persona: "other",
      personaOther: "Fisioterapeuta",
    });

    const edited = await sut.execute({
      userId: user.id,
      username: "ada",
      personaOther: "Fisioterapeuta Esportivo",
    });

    expect(edited.persona).toBe("other");
    expect(edited.personaOther).toBe("Fisioterapeuta Esportivo");
  });

  it("defaults to no label on an account that never set one", async () => {
    const user = await seedUser();

    const read = await readProfile.execute(user.id);

    expect(read.personaOther).toBeNull();
  });
});
