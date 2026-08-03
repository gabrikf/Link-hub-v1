import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { GetAgentPolicyUseCase } from "./get-agent-policy.use-case.js";

function makeUser(overrides: Partial<Parameters<typeof UserEntity.create>[0]> = {}) {
  return UserEntity.create({
    email: "user@example.com",
    login: "user",
    name: "User",
    password: "hashed",
    description: null,
    avatarUrl: null,
    googleId: null,
    ...overrides,
  });
}

function makeRole(
  userId: string,
  companyName: string,
  disclosureLevel: "summary" | "detailed" | "full" | null = null,
  displayOrder = 0,
) {
  return WorkExperienceEntity.create({
    userId,
    title: "Engineer",
    companyName,
    employmentType: null,
    workModel: null,
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    description: null,
    mainStack: [],
    disclosureLevel,
    displayOrder,
  });
}

describe("GetAgentPolicyUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: GetAgentPolicyUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    sut = new GetAgentPolicyUseCase(
      usersRepository,
      workExperienceRepository,
    );
  });

  it("returns the strictest level and no terms for an untouched account", async () => {
    const user = makeUser();
    await usersRepository.create(user);

    const policy = await sut.execute(user.id);

    expect(policy).toEqual({
      disclosureLevel: "summary",
      blockedTerms: [],
      perEmployer: [],
    });
  });

  it("returns the stored level and blocked terms", async () => {
    const user = makeUser({
      agentDisclosureLevel: "detailed",
      agentBlockedTerms: ["Project Falcon"],
    });
    await usersRepository.create(user);

    const policy = await sut.execute(user.id);

    expect(policy.disclosureLevel).toBe("detailed");
    expect(policy.blockedTerms).toEqual(["Project Falcon"]);
  });

  it("derives perEmployer from ONLY the roles that override the default", async () => {
    const user = makeUser();
    await usersRepository.create(user);

    await workExperienceRepository.create(makeRole(user.id, "Acme Corp", "full", 0));
    await workExperienceRepository.create(makeRole(user.id, "Nubank", null, 1));
    await workExperienceRepository.create(
      makeRole(user.id, "Stealth Client", "summary", 2),
    );

    const policy = await sut.execute(user.id);

    expect(policy.perEmployer).toEqual([
      expect.objectContaining({
        companyName: "Acme Corp",
        disclosureLevel: "full",
      }),
      expect.objectContaining({
        companyName: "Stealth Client",
        disclosureLevel: "summary",
      }),
    ]);
  });

  it("throws when the user does not exist", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
