import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import {
  GetWorkContextUseCase,
  calculateDurationMonths,
} from "./get-work-context.use-case.js";

interface RoleOverrides {
  title?: string;
  companyName?: string;
  description?: string | null;
  mainStack?: string[];
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  employmentType?: string | null;
  workModel?: string | null;
  disclosureLevel?: "summary" | "detailed" | "full" | null;
  displayOrder?: number;
}

function makeRole(userId: string, overrides: RoleOverrides = {}) {
  return WorkExperienceEntity.create({
    userId,
    title: overrides.title ?? "Senior Software Engineer",
    companyName: overrides.companyName ?? "Acme Corp",
    employmentType: overrides.employmentType ?? "full-time",
    workModel: overrides.workModel ?? "remote",
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: overrides.startDate ?? "2022-01-01",
    endDate: overrides.endDate ?? "2024-01-01",
    isCurrent: overrides.isCurrent ?? false,
    description: overrides.description ?? null,
    mainStack: overrides.mainStack ?? ["TypeScript", "Fastify"],
    disclosureLevel: overrides.disclosureLevel ?? null,
    displayOrder: overrides.displayOrder ?? 0,
  });
}

describe("GetWorkContextUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: GetWorkContextUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    sut = new GetWorkContextUseCase(usersRepository, workExperienceRepository);
  });

  async function seedUser(
    overrides: {
      agentDisclosureLevel?: "summary" | "detailed" | "full";
      agentBlockedTerms?: string[];
    } = {},
  ) {
    const user = UserEntity.create({
      email: "user@example.com",
      login: "user",
      name: "User",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
      ...overrides,
    });
    await usersRepository.create(user);
    return user;
  }

  it("hides the employer name at summary level", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, { companyName: "Acme Corp" }),
    );

    const context = await sut.execute(user.id);

    expect(context.disclosureLevel).toBe("summary");
    expect(context.roles[0].companyName).toBeNull();
  });

  it("includes the employer name at detailed and full level", async () => {
    const detailedUser = await seedUser({ agentDisclosureLevel: "detailed" });
    await workExperienceRepository.create(
      makeRole(detailedUser.id, { companyName: "Acme Corp" }),
    );

    const detailed = await sut.execute(detailedUser.id);
    expect(detailed.roles[0].companyName).toBe("Acme Corp");

    const fullUser = UserEntity.create({
      email: "full@example.com",
      login: "full",
      name: "Full",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
      agentDisclosureLevel: "full",
    });
    await usersRepository.create(fullUser);
    await workExperienceRepository.create(
      makeRole(fullUser.id, { companyName: "Nubank" }),
    );

    const full = await sut.execute(fullUser.id);
    expect(full.roles[0].companyName).toBe("Nubank");
  });

  it("redacts the employer name out of achievement text at summary level", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, {
        companyName: "Acme Corp",
        description:
          "Rebuilt checkout for Acme Corp.\nCut p95 latency by 40 percent.",
      }),
    );

    const context = await sut.execute(user.id);

    expect(context.roles[0].achievements[0]).toBe(
      "Rebuilt checkout for [employer].",
    );
    // Non-identifying outcome metrics survive — that is the whole trade.
    expect(context.roles[0].achievements[1]).toBe(
      "Cut p95 latency by 40 percent.",
    );
  });

  it("blocks EVERY employer name at summary level, not just the role's own", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, {
        companyName: "Acme Corp",
        description: "Migrated the data we later reused at Nubank.",
        displayOrder: 0,
      }),
    );
    await workExperienceRepository.create(
      makeRole(user.id, { companyName: "Nubank", displayOrder: 1 }),
    );

    const context = await sut.execute(user.id);

    expect(context.roles[0].achievements[0]).toContain("[employer]");
    expect(context.roles[0].achievements[0]).not.toContain("Nubank");
  });

  it("keeps a summary-level employer redacted inside a full-level role", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, {
        companyName: "VTEX",
        disclosureLevel: "full",
        description: "Migrated the ledger we later reused at PagBank.",
        displayOrder: 0,
      }),
    );
    await workExperienceRepository.create(
      makeRole(user.id, { companyName: "PagBank", displayOrder: 1 }),
    );

    const context = await sut.execute(user.id);

    // The permissive role may name ITSELF...
    expect(context.roles[0].companyName).toBe("VTEX");
    // ...but not the employer the user deliberately left at summary.
    expect(context.roles[0].achievements[0]).not.toContain("PagBank");
    expect(context.roles[0].achievements[0]).toContain("[employer]");
  });

  it("honours a per-role override over the account default", async () => {
    const user = await seedUser({ agentDisclosureLevel: "summary" });
    await workExperienceRepository.create(
      makeRole(user.id, {
        companyName: "Open Source Co",
        disclosureLevel: "detailed",
        displayOrder: 0,
      }),
    );
    await workExperienceRepository.create(
      makeRole(user.id, { companyName: "Secret Client", displayOrder: 1 }),
    );

    const context = await sut.execute(user.id);

    // Account-level level is still what the header reports.
    expect(context.disclosureLevel).toBe("summary");
    expect(context.roles[0].companyName).toBe("Open Source Co");
    expect(context.roles[1].companyName).toBeNull();
  });

  it("applies the user's own blocked terms even at full level", async () => {
    const user = await seedUser({
      agentDisclosureLevel: "full",
      agentBlockedTerms: ["Project Falcon"],
    });
    await workExperienceRepository.create(
      makeRole(user.id, {
        companyName: "Acme Corp",
        description: "Led Project Falcon to launch.",
      }),
    );

    const context = await sut.execute(user.id);

    expect(context.roles[0].companyName).toBe("Acme Corp");
    expect(context.roles[0].achievements[0]).toBe("Led [employer] to launch.");
  });

  it("surfaces stack, practices, domain and seniority — the safe signal", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, {
        title: "Senior Backend Engineer",
        mainStack: ["TypeScript", "PostgreSQL"],
        description:
          "Practised TDD and trunk-based development on the payments platform with full CI/CD.",
      }),
    );

    const role = (await sut.execute(user.id)).roles[0];

    expect(role.seniorityHint).toBe("senior");
    expect(role.stack).toEqual(["TypeScript", "PostgreSQL"]);
    expect(role.practices).toEqual(
      expect.arrayContaining(["TDD", "CI/CD", "trunk-based development"]),
    );
    expect(role.domain).toBe("payments");
  });

  it("reports duration in whole months", async () => {
    const user = await seedUser();
    await workExperienceRepository.create(
      makeRole(user.id, { startDate: "2022-01-01", endDate: "2024-01-01" }),
    );

    expect((await sut.execute(user.id)).roles[0].durationMonths).toBe(24);
  });

  it("returns an empty role list for a user with no work history", async () => {
    const user = await seedUser();

    expect((await sut.execute(user.id)).roles).toEqual([]);
  });

  it("throws when the user does not exist", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});

describe("calculateDurationMonths", () => {
  it("counts whole months between two dates", () => {
    expect(calculateDurationMonths("2022-01-01", "2022-07-01", false)).toBe(6);
  });

  it("measures a current role against now", () => {
    const now = new Date("2024-01-15T00:00:00Z");
    expect(calculateDurationMonths("2023-01-01", null, true, now)).toBe(12);
  });

  it("returns null without a start date", () => {
    expect(calculateDurationMonths(null, "2024-01-01", false)).toBeNull();
  });

  it("clamps an inverted range to zero rather than going negative", () => {
    expect(calculateDurationMonths("2024-01-01", "2022-01-01", false)).toBe(0);
  });
});
