import { beforeEach, describe, expect, it } from "vitest";
import type {
  AgentDisclosureLevel,
  DigestCadence,
  GitConnectionKind,
} from "@repo/schemas";
import { resolveEffectiveLevel } from "../../use-case/agent-policy/redact-work-disclosure.js";
import { InMemoryUsersRepository } from "../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../repositories/work-experience/in-memory-work-experience-repository.js";
import { UserEntity } from "../user/user-entity.js";
import { WorkExperienceEntity } from "../work-experience/work-experience-entity.js";
import { GitConnectionEntity } from "./git-connection-entity.js";

function makeConnection(
  overrides: {
    kind?: GitConnectionKind;
    cadence?: DigestCadence;
    lastDigestAt?: Date | null;
    workExperienceId?: string | null;
    disclosureLevelOverride?: AgentDisclosureLevel | null;
    userId?: string;
  } = {},
) {
  return GitConnectionEntity.create({
    userId: overrides.userId ?? "user-1",
    provider: "github",
    kind: overrides.kind ?? "personal",
    displayName: "Personal GitHub",
    externalAccountId: "gh-1",
    workExperienceId: overrides.workExperienceId ?? null,
    disclosureLevelOverride: overrides.disclosureLevelOverride ?? null,
    webhookSecret: null,
    autoPostEnabled: true,
    cadence: overrides.cadence ?? "weekly",
    includeAgentSummary: false,
    lastDigestAt: overrides.lastDigestAt ?? null,
  });
}

describe("GitConnectionEntity — isDueForDigest", () => {
  /**
   * `off` is the case worth stating loudly: it is not "a very long interval",
   * it is "never". A connection the user muted must stay muted no matter how
   * long it has been, and — the trap — even if it has NEVER produced a digest,
   * which is the branch that returns `true` for every other cadence.
   */
  it("is never due when the cadence is off, even having never digested", () => {
    const neverDigested = makeConnection({
      cadence: "off",
      lastDigestAt: null,
    });
    const longIdle = makeConnection({
      cadence: "off",
      lastDigestAt: new Date("2020-01-01T00:00:00Z"),
    });

    expect(neverDigested.isDueForDigest(new Date("2026-01-01T00:00:00Z"))).toBe(
      false,
    );
    expect(longIdle.isDueForDigest(new Date("2026-01-01T00:00:00Z"))).toBe(
      false,
    );
    expect(neverDigested.nextDigestDueAt()).toBeNull();
  });

  it.each(["weekly", "biweekly", "monthly"] as const)(
    "is due immediately on a %s cadence that has never digested",
    (cadence) => {
      const connection = makeConnection({ cadence, lastDigestAt: null });

      // No previous run to measure an interval from. Waiting a full cadence
      // before the first digest would make a fresh connection look broken.
      expect(connection.isDueForDigest(new Date("2026-01-01T00:00:00Z"))).toBe(
        true,
      );
      expect(connection.nextDigestDueAt()).toBeNull();
    },
  );

  it.each([
    { cadence: "weekly" as const, notYet: "2026-01-07T23:00:00Z", due: "2026-01-08T00:00:00Z" },
    { cadence: "biweekly" as const, notYet: "2026-01-14T23:00:00Z", due: "2026-01-15T00:00:00Z" },
    { cadence: "monthly" as const, notYet: "2026-01-31T23:00:00Z", due: "2026-02-01T00:00:00Z" },
  ])(
    "on a $cadence cadence, is not due before the interval and is due at it",
    ({ cadence, notYet, due }) => {
      const connection = makeConnection({
        cadence,
        lastDigestAt: new Date("2026-01-01T00:00:00Z"),
      });

      expect(connection.isDueForDigest(new Date(notYet))).toBe(false);
      expect(connection.isDueForDigest(new Date(due))).toBe(true);
    },
  );

  it("advances monthly by a calendar month, clamping Jan 31 to February", () => {
    const connection = makeConnection({
      cadence: "monthly",
      lastDigestAt: new Date(2026, 0, 31, 12, 0, 0),
    });

    // A bare `setMonth(+1)` produces Feb 31 -> Mar 3, skipping February
    // altogether and pushing the due date later every short month.
    const due = connection.nextDigestDueAt()!;
    expect(due.getMonth()).toBe(1);
    expect(due.getDate()).toBe(28);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const connection = makeConnection({
      cadence: "monthly",
      lastDigestAt: new Date(2028, 0, 31, 12, 0, 0),
    });

    const due = connection.nextDigestDueAt()!;
    expect(due.getMonth()).toBe(1);
    expect(due.getDate()).toBe(29);
  });

  it("keeps the day of month when the target month is long enough", () => {
    const connection = makeConnection({
      cadence: "monthly",
      lastDigestAt: new Date(2026, 2, 15, 12, 0, 0),
    });

    const due = connection.nextDigestDueAt()!;
    expect(due.getMonth()).toBe(3);
    expect(due.getDate()).toBe(15);
  });

  it("stays undue for another full cadence once a digest is recorded", () => {
    const connection = makeConnection({ cadence: "weekly", lastDigestAt: null });
    expect(connection.isDueForDigest(new Date("2026-01-01T00:00:00Z"))).toBe(
      true,
    );

    connection.markDigested(new Date("2026-01-01T00:00:00Z"));

    expect(connection.isDueForDigest(new Date("2026-01-04T06:00:00Z"))).toBe(
      false,
    );
    expect(connection.isDueForDigest(new Date("2026-01-08T00:00:00Z"))).toBe(
      true,
    );
  });

  it("answers only the cadence question, ignoring autoPostEnabled", () => {
    const connection = makeConnection({ cadence: "weekly", lastDigestAt: null });
    connection.updateSettings({ autoPostEnabled: false });

    // Pausing publication must not silently reschedule anything: "may this
    // publish" is the caller's separate check, so resuming later gives the user
    // the schedule they configured rather than a catch-up burst.
    expect(connection.isDueForDigest(new Date("2026-01-01T00:00:00Z"))).toBe(
      true,
    );
  });
});

/**
 * Disclosure inheritance for a connection.
 *
 * The chain the schema documents is: the connection's own override, else the
 * linked role's `work_experiences.disclosure_level`, else the account-level
 * `users.agent_disclosure_level`. Two existing pieces already own it —
 * `GitConnectionEntity.resolvesDisclosureVia()` decides WHICH role a connection
 * inherits through, and `resolveEffectiveLevel` owns the precedence between an
 * override and the level below it — so this composes them rather than
 * reimplementing the rule, and pins the composition the ingestion and digest
 * paths must both use.
 */
describe("GitConnectionEntity — isWork", () => {
  it("classifies MIXED as work, not as personal", () => {
    // A `mixed` machine holds personal and employer repositories at once. Its
    // digest aggregates both, so no number in it can be attributed to the
    // personal half — the employer's rules have to govern all of it.
    expect(makeConnection({ kind: "mixed" }).isWork()).toBe(true);
    expect(makeConnection({ kind: "work" }).isWork()).toBe(true);
    expect(makeConnection({ kind: "personal" }).isWork()).toBe(false);
  });
});

describe("GitConnectionEntity — disclosure inheritance", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
  });

  async function seedUser(agentDisclosureLevel?: AgentDisclosureLevel) {
    const user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
      ...(agentDisclosureLevel ? { agentDisclosureLevel } : {}),
    });
    await usersRepository.create(user);
    return user;
  }

  async function seedRole(
    userId: string,
    disclosureLevel: AgentDisclosureLevel | null,
  ) {
    const role = WorkExperienceEntity.create({
      userId,
      title: "Senior Software Engineer",
      companyName: "Acme Corp",
      employmentType: "full-time",
      workModel: "remote",
      locationCity: null,
      locationState: null,
      locationCountry: null,
      startDate: "2022-01-01",
      endDate: null,
      isCurrent: true,
      description: null,
      mainStack: ["TypeScript"],
      disclosureLevel,
      displayOrder: 0,
    });
    await workExperienceRepository.create(role);
    return role;
  }

  /** The full chain, built from the two production pieces that already own it. */
  async function resolveLevel(
    connection: GitConnectionEntity,
  ): Promise<AgentDisclosureLevel> {
    const user = await usersRepository.findById(connection.userId);

    const roleId = connection.resolvesDisclosureVia();
    const role = roleId
      ? await workExperienceRepository.findById(roleId)
      : null;

    const inherited = resolveEffectiveLevel(
      user?.agentDisclosureLevel,
      role?.disclosureLevel,
    );

    return resolveEffectiveLevel(
      inherited,
      connection.disclosureLevelOverride,
    );
  }

  it("resolves a work connection through its role's disclosure level", async () => {
    const user = await seedUser("full");
    const role = await seedRole(user.id, "summary");
    const connection = makeConnection({
      userId: user.id,
      kind: "work",
      workExperienceId: role.id,
    });

    // The employer's rule wins over the account default: the account level is
    // what the user wants for their OWN work, not for this employer's.
    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });

  it("falls back to the account level when the role sets no override", async () => {
    const user = await seedUser("detailed");
    const role = await seedRole(user.id, null);
    const connection = makeConnection({
      userId: user.id,
      kind: "work",
      workExperienceId: role.id,
    });

    await expect(resolveLevel(connection)).resolves.toBe("detailed");
  });

  it("falls back to the account level when a work connection has no role", async () => {
    const user = await seedUser("summary");
    const connection = makeConnection({
      userId: user.id,
      kind: "work",
      workExperienceId: null,
    });

    expect(connection.resolvesDisclosureVia()).toBeNull();
    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });

  it("resolves a MIXED connection through its role, exactly like work", async () => {
    const user = await seedUser("full");
    const role = await seedRole(user.id, "summary");
    const connection = makeConnection({
      userId: user.id,
      kind: "mixed",
      workExperienceId: role.id,
    });

    // The half of the machine that is the employer's decides for the whole
    // machine: `mixed` must not fall back to the looser account level.
    expect(connection.resolvesDisclosureVia()).toBe(role.id);
    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });

  it("falls back to the account level when a MIXED connection has no role", async () => {
    const user = await seedUser("summary");
    const connection = makeConnection({
      userId: user.id,
      kind: "mixed",
      workExperienceId: null,
    });

    expect(connection.resolvesDisclosureVia()).toBeNull();
    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });

  it("ignores a role on a PERSONAL connection", async () => {
    const user = await seedUser("full");
    const role = await seedRole(user.id, "summary");
    const connection = makeConnection({
      userId: user.id,
      kind: "personal",
      workExperienceId: role.id,
    });

    // A per-employer level has no meaning for the user's own side projects, and
    // honouring it would apply an employer's redaction rules to work that is
    // not the employer's.
    expect(connection.resolvesDisclosureVia()).toBeNull();
    await expect(resolveLevel(connection)).resolves.toBe("full");
  });

  it("lets a per-connection override win over both role and account", async () => {
    const user = await seedUser("full");
    const role = await seedRole(user.id, "detailed");
    const connection = makeConnection({
      userId: user.id,
      kind: "work",
      workExperienceId: role.id,
      disclosureLevelOverride: "summary",
    });

    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });

  it("defaults to the safest level when nothing is configured anywhere", async () => {
    const user = await seedUser();
    const connection = makeConnection({ userId: user.id, kind: "work" });

    // `resolveEffectiveLevel` falls back to DEFAULT_AGENT_DISCLOSURE_LEVEL,
    // which is `summary` — an unconfigured account must not leak employer names.
    await expect(resolveLevel(connection)).resolves.toBe("summary");
  });
});
