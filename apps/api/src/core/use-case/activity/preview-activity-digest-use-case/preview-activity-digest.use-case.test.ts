import type { ActivityEventKind, AgentDisclosureLevel } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryActivityEventRepository } from "../../../repositories/activity-event/in-memory-activity-event-repository.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { BuildCandidateEvidenceUseCase } from "../build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { PreviewActivityDigestUseCase } from "./preview-activity-digest.use-case.js";

const EMPLOYER = "Nubank";
const NOW = new Date("2026-08-14T09:00:00.000Z");

let deliveryCounter = 0;

describe("PreviewActivityDigestUseCase", () => {
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let activityEventRepository: InMemoryActivityEventRepository;
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let sut: PreviewActivityDigestUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    activityEventRepository = new InMemoryActivityEventRepository();
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();

    user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);

    sut = new PreviewActivityDigestUseCase(
      gitConnectionRepository,
      usersRepository,
      workExperienceRepository,
      new BuildCandidateEvidenceUseCase(activityEventRepository),
    );
  });

  function makeConnection(
    overrides: Partial<{
      kind: "personal" | "work";
      cadence: "weekly" | "biweekly" | "monthly" | "off";
      workExperienceId: string | null;
      lastDigestAt: Date | null;
    }> = {},
  ): GitConnectionEntity {
    const connection = GitConnectionEntity.create({
      userId: user.id,
      provider: "github",
      kind: overrides.kind ?? "personal",
      displayName: "GitHub",
      externalAccountId: "gh-1",
      workExperienceId: overrides.workExperienceId ?? null,
      disclosureLevelOverride: null,
      webhookSecret: null,
      autoPostEnabled: true,
      cadence: overrides.cadence ?? "weekly",
      includeAgentSummary: false,
      lastDigestAt: overrides.lastDigestAt ?? null,
    });

    gitConnectionRepository.seed(connection);
    return connection;
  }

  async function seedEvent(
    connection: GitConnectionEntity,
    overrides: {
      kind?: ActivityEventKind;
      occurredOn?: string;
      technologies?: string[];
    } = {},
  ) {
    deliveryCounter += 1;

    await activityEventRepository.create(
      ActivityEventEntity.create({
        userId: connection.userId,
        connectionId: connection.id,
        source: "github",
        externalDeliveryId: `delivery-${deliveryCounter}`,
        kind: overrides.kind ?? "pull_request_merged",
        occurredOn: overrides.occurredOn ?? "2026-08-10",
        repoFingerprint: "a".repeat(64),
        technologies: overrides.technologies ?? ["TypeScript"],
        actorIsOwner: true,
        counterpartyFingerprints: ["1".repeat(64)],
        payload: null,
      }),
    );
  }

  it("reports no_activity for a window with zero events", async () => {
    const connection = makeConnection();

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result).toEqual({
      status: "no_activity",
      post: null,
      window: { from: "2026-08-08", to: "2026-08-14" },
      eventCount: 0,
    });
  });

  it("reports insufficient_evidence when only unwarranted events exist", async () => {
    const connection = makeConnection();
    // Commits alone never clear the publishable bar — the same gate the
    // generator applies, so preview and digest cannot disagree about a week.
    await seedEvent(connection, { kind: "commit" });
    await seedEvent(connection, { kind: "commit" });

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result.status).toBe("insufficient_evidence");
    expect(result.post).toBeNull();
    expect(result.eventCount).toBe(2);
  });

  it("renders the digest the generator would produce when evidence is publishable", async () => {
    const connection = makeConnection();
    await seedEvent(connection);

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result.status).toBe("ready");
    expect(result.eventCount).toBe(1);
    expect(result.post?.title).toContain("Merged 1 change");
    expect(result.post?.body).toContain("2026-08-08 to 2026-08-14");
    expect(result.post?.tags).toEqual(["typescript"]);
  });

  it("persists NOTHING — no post, no digest stamp, no cadence advance", async () => {
    const connection = makeConnection();
    await seedEvent(connection);
    const updatedAtBefore = connection.updatedAt;

    await sut.execute({ userId: user.id, connectionId: connection.id, now: NOW });

    // A preview that stamped the connection would burn the real run's window;
    // one that wrote a post would burn its idempotency key.
    expect(connection.lastDigestAt).toBeNull();
    expect(connection.updatedAt).toEqual(updatedAtBefore);
    expect(activityEventRepository.items).toHaveLength(1);
  });

  it("previews a trailing cadence window even when a digest just ran", async () => {
    // The REAL next window would be an inverted stub; the preview must still
    // show a typical period or every freshly-digested connection previews as
    // "no activity".
    const connection = makeConnection({ lastDigestAt: NOW });
    await seedEvent(connection);

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result.window).toEqual({ from: "2026-08-08", to: "2026-08-14" });
    expect(result.status).toBe("ready");
  });

  it("previews an 'off' connection over a weekly window", async () => {
    const connection = makeConnection({ cadence: "off" });
    await seedEvent(connection);

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result.window).toEqual({ from: "2026-08-08", to: "2026-08-14" });
    expect(result.status).toBe("ready");
  });

  it("applies the connection's disclosure to the preview text", async () => {
    const role = WorkExperienceEntity.create({
      userId: user.id,
      title: "Senior Engineer",
      companyName: EMPLOYER,
      employmentType: "full-time",
      workModel: "remote",
      locationCity: null,
      locationState: null,
      locationCountry: null,
      startDate: "2023-01-01",
      endDate: null,
      isCurrent: true,
      description: null,
      mainStack: ["TypeScript"],
      disclosureLevel: "summary" satisfies AgentDisclosureLevel,
      displayOrder: 0,
    });
    workExperienceRepository.seed(role);

    const connection = makeConnection({
      kind: "work",
      workExperienceId: role.id,
    });
    // A tag carrying the employer's name is the one route into the template.
    await seedEvent(connection, { technologies: [EMPLOYER, "TypeScript"] });

    const result = await sut.execute({
      userId: user.id,
      connectionId: connection.id,
      now: NOW,
    });

    expect(result.status).toBe("ready");
    expect(JSON.stringify(result)).not.toContain(EMPLOYER);
    expect(result.post?.tags).toEqual(["typescript"]);
  });

  it("answers the SAME NotFound for a missing id and someone else's connection", async () => {
    const stranger = UserEntity.create({
      email: "other@example.com",
      login: "other",
      name: "Other",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(stranger);
    const theirs = GitConnectionEntity.create({
      userId: stranger.id,
      provider: "github",
      kind: "personal",
      displayName: "Theirs",
      externalAccountId: null,
      workExperienceId: null,
      disclosureLevelOverride: null,
      webhookSecret: null,
      autoPostEnabled: false,
      cadence: "weekly",
      includeAgentSummary: false,
      lastDigestAt: null,
    });
    gitConnectionRepository.seed(theirs);

    await expect(
      sut.execute({ userId: user.id, connectionId: "missing", now: NOW }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      sut.execute({ userId: user.id, connectionId: theirs.id, now: NOW }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
