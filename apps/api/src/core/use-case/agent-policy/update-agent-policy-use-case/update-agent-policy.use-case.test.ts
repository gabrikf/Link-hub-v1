import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { UpdateAgentPolicyUseCase } from "./update-agent-policy.use-case.js";

describe("UpdateAgentPolicyUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: UpdateAgentPolicyUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    sut = new UpdateAgentPolicyUseCase(
      usersRepository,
      workExperienceRepository,
    );

    user = UserEntity.create({
      email: "user@example.com",
      login: "user",
      name: "User",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);
  });

  it("changes the disclosure level and persists it", async () => {
    const policy = await sut.execute({
      userId: user.id,
      disclosureLevel: "detailed",
    });

    expect(policy.disclosureLevel).toBe("detailed");

    const stored = await usersRepository.findById(user.id);
    expect(stored?.agentDisclosureLevel).toBe("detailed");
  });

  it("replaces blocked terms wholesale rather than appending", async () => {
    await sut.execute({ userId: user.id, blockedTerms: ["Falcon", "Atlas"] });
    const policy = await sut.execute({ userId: user.id, blockedTerms: ["Atlas"] });

    expect(policy.blockedTerms).toEqual(["Atlas"]);
  });

  it("leaves a field untouched when it is not part of the patch", async () => {
    await sut.execute({
      userId: user.id,
      disclosureLevel: "full",
      blockedTerms: ["Falcon"],
    });

    const policy = await sut.execute({ userId: user.id, blockedTerms: [] });

    expect(policy.disclosureLevel).toBe("full");
    expect(policy.blockedTerms).toEqual([]);
  });

  it("trims terms and drops empty / too-short ones so no rule is dead on arrival", async () => {
    const policy = await sut.execute({
      userId: user.id,
      blockedTerms: ["  Falcon  ", "", "  ", "x"],
    });

    expect(policy.blockedTerms).toEqual(["Falcon"]);
  });

  it("de-duplicates terms case-insensitively", async () => {
    const policy = await sut.execute({
      userId: user.id,
      blockedTerms: ["Falcon", "falcon", "FALCON"],
    });

    expect(policy.blockedTerms).toEqual(["Falcon"]);
  });

  it("throws when the user does not exist", async () => {
    await expect(
      sut.execute({ userId: "missing-user", disclosureLevel: "full" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
