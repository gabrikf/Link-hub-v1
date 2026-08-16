import { beforeEach, describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryActivityEventRepository } from "../../../repositories/activity-event/in-memory-activity-event-repository.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { GetConnectionHealthUseCase } from "./get-connection-health.use-case.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-14T09:00:00.000Z");

let deliveryCounter = 0;

describe("GetConnectionHealthUseCase", () => {
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let activityEventRepository: InMemoryActivityEventRepository;
  let sut: GetConnectionHealthUseCase;
  let connection: GitConnectionEntity;

  beforeEach(() => {
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    activityEventRepository = new InMemoryActivityEventRepository();
    sut = new GetConnectionHealthUseCase(
      gitConnectionRepository,
      activityEventRepository,
    );

    connection = seedConnection({ userId: OWNER_ID });
  });

  function seedConnection(
    overrides: Partial<{
      userId: string;
      cadence: "weekly" | "biweekly" | "monthly" | "off";
      lastDigestAt: Date | null;
    }> = {},
  ): GitConnectionEntity {
    const seeded = GitConnectionEntity.create({
      userId: overrides.userId ?? OWNER_ID,
      provider: "github",
      kind: "personal",
      displayName: "GitHub",
      externalAccountId: "gh-1",
      workExperienceId: null,
      disclosureLevelOverride: null,
      webhookSecret: null,
      autoPostEnabled: true,
      cadence: overrides.cadence ?? "weekly",
      includeAgentSummary: false,
      lastDigestAt: overrides.lastDigestAt ?? null,
    });
    gitConnectionRepository.seed(seeded);
    return seeded;
  }

  async function seedEvent(overrides: {
    occurredOn: string;
    repoFingerprint?: string;
  }) {
    deliveryCounter += 1;
    await activityEventRepository.create(
      ActivityEventEntity.create({
        userId: connection.userId,
        connectionId: connection.id,
        source: "github",
        externalDeliveryId: `delivery-${deliveryCounter}`,
        kind: "commit",
        occurredOn: overrides.occurredOn,
        repoFingerprint: overrides.repoFingerprint ?? "a".repeat(64),
        technologies: [],
        actorIsOwner: true,
        counterpartyFingerprints: [],
        payload: null,
      }),
    );
  }

  it("reports an empty connection as zeros rather than an error", async () => {
    const health = await sut.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      now: NOW,
    });

    // "Nothing has arrived yet" is the normal state during setup — it is
    // exactly what the wizard polls for — so it must be a 200 shape, not a 404.
    expect(health).toEqual({
      connectionId: connection.id,
      totalEvents: 0,
      lastEventOn: null,
      eventsLast7Days: 0,
      distinctReposLast30Days: 0,
      lastDigestAt: null,
      nextDigestDueAt: null,
    });
  });

  it("counts totals, the 7-day window and 30-day distinct repos separately", async () => {
    const repoA = "a".repeat(64);
    const repoB = "b".repeat(64);

    // Inside the 7-day window (2026-08-08..14).
    await seedEvent({ occurredOn: "2026-08-14", repoFingerprint: repoA });
    await seedEvent({ occurredOn: "2026-08-08", repoFingerprint: repoA });
    // Outside 7 days, inside 30 (2026-07-16..14).
    await seedEvent({ occurredOn: "2026-08-01", repoFingerprint: repoB });
    // Outside both windows, still part of the total.
    await seedEvent({ occurredOn: "2026-05-01", repoFingerprint: "c".repeat(64) });

    const health = await sut.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      now: NOW,
    });

    expect(health.totalEvents).toBe(4);
    expect(health.lastEventOn).toBe("2026-08-14");
    expect(health.eventsLast7Days).toBe(2);
    // repoA and repoB in the last 30 days; the May repo is out of the window.
    expect(health.distinctReposLast30Days).toBe(2);
  });

  it("treats the window edges as inclusive of today and the boundary day", async () => {
    await seedEvent({ occurredOn: "2026-08-08" }); // day 7 of 7 — in.
    await seedEvent({ occurredOn: "2026-08-07" }); // day 8 — out.

    const health = await sut.execute({
      userId: OWNER_ID,
      connectionId: connection.id,
      now: NOW,
    });

    expect(health.eventsLast7Days).toBe(1);
  });

  it("carries the digest schedule from the entity, not a re-derivation", async () => {
    const lastDigestAt = new Date("2026-08-10T00:00:00.000Z");
    const digested = seedConnection({ cadence: "weekly", lastDigestAt });

    const health = await sut.execute({
      userId: OWNER_ID,
      connectionId: digested.id,
      now: NOW,
    });

    expect(health.lastDigestAt).toEqual(lastDigestAt);
    expect(health.nextDigestDueAt).toEqual(digested.nextDigestDueAt());
  });

  it("answers NotFound for a connection id that does not exist", async () => {
    await expect(
      sut.execute({
        userId: OWNER_ID,
        connectionId: "33333333-3333-4333-8333-333333333333",
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("answers the SAME NotFound for someone else's connection", async () => {
    // Mirroring ingestion: distinguishing "missing" from "not yours" would make
    // this endpoint an oracle for which connection ids are real.
    await expect(
      sut.execute({
        userId: STRANGER_ID,
        connectionId: connection.id,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
