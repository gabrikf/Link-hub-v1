import type { DigestCadence } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { InMemoryActivityDigestQueue } from "../../../providers/queue/in-memory-activity-digest-queue.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { buildDigestKey, resolveDigestWindow } from "../shared/digest-window.js";
import { SweepDueActivityDigestsUseCase } from "./sweep-due-activity-digests.use-case.js";

const NOW = new Date("2026-08-14T09:00:00.000Z");

describe("SweepDueActivityDigestsUseCase", () => {
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let queue: InMemoryActivityDigestQueue;
  let sut: SweepDueActivityDigestsUseCase;

  beforeEach(() => {
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    queue = new InMemoryActivityDigestQueue();
    sut = new SweepDueActivityDigestsUseCase(gitConnectionRepository, queue);
  });

  function seedConnection(overrides: {
    cadence: DigestCadence;
    lastDigestAt: Date | null;
    autoPostEnabled?: boolean;
  }): GitConnectionEntity {
    const connection = GitConnectionEntity.create({
      userId: "user-1",
      provider: "github",
      kind: "personal",
      displayName: "GitHub",
      externalAccountId: `gh-${gitConnectionRepository.items.length}`,
      workExperienceId: null,
      disclosureLevelOverride: null,
      webhookSecret: null,
      autoPostEnabled: overrides.autoPostEnabled ?? true,
      cadence: overrides.cadence,
      includeAgentSummary: false,
      lastDigestAt: overrides.lastDigestAt,
    });

    gitConnectionRepository.seed(connection);
    return connection;
  }

  describe("cadence drives the sweep", () => {
    it.each([
      // [cadence, days since the last digest, should be enqueued]
      ["weekly", 7, true],
      ["weekly", 6, false],
      ["monthly", 31, true],
      ["monthly", 20, false],
      // `off` is never due, however long it has been. This is the switch a user
      // flips to make the product stop posting, so it has to be absolute.
      ["off", 365, false],
    ] as const)(
      "cadence %s, %i days since the last digest -> enqueued: %s",
      async (cadence, daysAgo, expected) => {
        seedConnection({
          cadence,
          lastDigestAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
        });

        const result = await sut.execute({ now: NOW });

        expect(result.enqueued).toBe(expected ? 1 : 0);
      },
    );

    it("treats a never-digested connection as due immediately", async () => {
      // Waiting a full cadence before the first post makes a freshly connected
      // source look broken.
      seedConnection({ cadence: "weekly", lastDigestAt: null });

      expect((await sut.execute({ now: NOW })).enqueued).toBe(1);
    });

    it("never enqueues an 'off' connection, even on its first run", async () => {
      seedConnection({ cadence: "off", lastDigestAt: null });

      expect((await sut.execute({ now: NOW })).enqueued).toBe(0);
    });
  });

  describe("auto-posting is a separate switch", () => {
    it("skips a connection whose owner turned auto-posting off", async () => {
      // The repository already filters these out; the use case re-checks
      // because the filter exists twice (a WHERE clause and an array filter)
      // and publishing without consent is the one failure that must not happen.
      const connection = seedConnection({
        cadence: "weekly",
        lastDigestAt: null,
        autoPostEnabled: false,
      });
      // Force the repository to hand it over anyway, as a drifted predicate
      // would.
      gitConnectionRepository.listAutoPostEnabled = async () => [connection];

      expect((await sut.execute({ now: NOW })).enqueued).toBe(0);
    });
  });

  describe("the enqueued job", () => {
    it("pins the window and the digest key at enqueue time", async () => {
      const connection = seedConnection({
        cadence: "weekly",
        lastDigestAt: new Date("2026-08-07T09:00:00.000Z"),
      });

      await sut.execute({ now: NOW });

      const window = resolveDigestWindow(connection, NOW);

      // Pinned rather than recomputed by the worker: a job that sits in the
      // queue over midnight must still digest the window it was created for.
      expect(queue.jobs).toEqual([
        {
          connectionId: connection.id,
          userId: connection.userId,
          digestKey: buildDigestKey(connection.id, window),
          window: { from: "2026-08-08", to: "2026-08-14" },
          reason: "cadence-sweep",
          triggeredAt: NOW.toISOString(),
        },
      ]);
    });

    it("enqueues the same key twice when run twice, and leaves the collapsing to the queue and the database", async () => {
      seedConnection({ cadence: "weekly", lastDigestAt: null });

      await sut.execute({ now: NOW });
      await sut.execute({ now: NOW });

      // The sweep is deliberately dumb: it does not track what it has already
      // queued. Exactly-once is guaranteed by the `digestKey` lookup in the
      // posts table, so a sweep that queues twice costs a no-op job, never a
      // duplicate post.
      expect(queue.jobs).toHaveLength(2);
      expect(queue.jobs[0].digestKey).toBe(queue.jobs[1].digestKey);
    });
  });

  it("reports how many connections were considered and how many were due", async () => {
    seedConnection({ cadence: "weekly", lastDigestAt: null });
    seedConnection({ cadence: "off", lastDigestAt: null });
    seedConnection({
      cadence: "weekly",
      lastDigestAt: new Date(NOW.getTime() - 86_400_000),
    });

    expect(await sut.execute({ now: NOW })).toEqual({
      considered: 3,
      enqueued: 1,
    });
  });
});
