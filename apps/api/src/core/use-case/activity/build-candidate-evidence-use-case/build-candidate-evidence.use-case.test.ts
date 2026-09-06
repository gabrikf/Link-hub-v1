import type { ActivityEventKind, ActivitySource } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { InMemoryActivityEventRepository } from "../../../repositories/activity-event/in-memory-activity-event-repository.js";
import { BuildCandidateEvidenceUseCase } from "./build-candidate-evidence.use-case.js";
import {
  deriveCandidateEvidence,
  hasPublishableEvidence,
} from "./candidate-evidence.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";

/** Stand-ins for what the ingestion path hashes. Never a repo name. */
const REPO_A = "a".repeat(64);
const REPO_B = "b".repeat(64);
const REVIEWER_1 = "1".repeat(64);
const REVIEWER_2 = "2".repeat(64);
const REVIEWER_3 = "3".repeat(64);

let deliveryCounter = 0;

interface EventOverrides {
  kind?: ActivityEventKind;
  occurredOn?: string;
  source?: ActivitySource;
  repoFingerprint?: string;
  technologies?: string[];
  actorIsOwner?: boolean;
  counterpartyFingerprints?: string[];
  userId?: string;
  connectionId?: string;
}

function makeEvent(overrides: EventOverrides = {}): ActivityEventEntity {
  deliveryCounter += 1;

  return ActivityEventEntity.create({
    userId: overrides.userId ?? USER_ID,
    connectionId: overrides.connectionId ?? CONNECTION_ID,
    source: overrides.source ?? "github",
    externalDeliveryId: `delivery-${deliveryCounter}`,
    kind: overrides.kind ?? "commit",
    occurredOn: overrides.occurredOn ?? "2026-08-10",
    repoFingerprint: overrides.repoFingerprint ?? REPO_A,
    technologies: overrides.technologies ?? [],
    actorIsOwner: overrides.actorIsOwner ?? true,
    counterpartyFingerprints: overrides.counterpartyFingerprints ?? [],
    payload: null,
  });
}

const WINDOW = { from: "2026-08-08", to: "2026-08-14" };

describe("deriveCandidateEvidence — third-party warranted work", () => {
  it("reports the merge count together with the DISTINCT approver count", () => {
    const events = [
      makeEvent({
        kind: "pull_request_merged",
        counterpartyFingerprints: [REVIEWER_1, REVIEWER_2],
      }),
      makeEvent({
        kind: "pull_request_merged",
        counterpartyFingerprints: [REVIEWER_2, REVIEWER_3],
      }),
      makeEvent({
        kind: "pull_request_merged",
        counterpartyFingerprints: [REVIEWER_1],
      }),
    ];

    const claim = deriveCandidateEvidence(
      events,
      WINDOW,
    ).thirdPartyWarrantedWork;

    expect(claim?.mergedChangeCount).toBe(3);
    // THE de-duplication that makes this claim hard to inflate: five approval
    // records, three people. Counting per-event and summing would say five.
    expect(claim?.distinctApproverCount).toBe(3);
  });

  it("does not count a merge the user did not author", () => {
    const events = [
      makeEvent({ kind: "pull_request_merged", actorIsOwner: true }),
      makeEvent({ kind: "pull_request_merged", actorIsOwner: false }),
    ];

    expect(
      deriveCandidateEvidence(events, WINDOW).thirdPartyWarrantedWork
        ?.mergedChangeCount,
    ).toBe(1);
  });

  it("still emits the claim when nobody approved, with zero approvers", () => {
    const claim = deriveCandidateEvidence(
      [makeEvent({ kind: "pull_request_merged" })],
      WINDOW,
    ).thirdPartyWarrantedWork;

    expect(claim?.mergedChangeCount).toBe(1);
    expect(claim?.distinctApproverCount).toBe(0);
  });
});

describe("deriveCandidateEvidence — review given to others", () => {
  it("counts reviews the user submitted on other people's work", () => {
    const events = [
      makeEvent({
        kind: "review_submitted",
        actorIsOwner: false,
        counterpartyFingerprints: [REVIEWER_1],
      }),
      makeEvent({
        kind: "review_submitted",
        actorIsOwner: false,
        counterpartyFingerprints: [REVIEWER_1, REVIEWER_2],
      }),
    ];

    const claim = deriveCandidateEvidence(events, WINDOW).reviewGiven;

    expect(claim?.reviewCount).toBe(2);
    expect(claim?.distinctAuthorCount).toBe(2);
  });

  it("ignores a 'review_submitted' on the user's own work", () => {
    // `actorIsOwner: true` on a submitted review means the user reviewed their
    // own change, which is not mentoring and is trivially self-issued.
    const events = [
      makeEvent({ kind: "review_submitted", actorIsOwner: true }),
    ];

    expect(deriveCandidateEvidence(events, WINDOW).reviewGiven).toBeNull();
  });

  it("ignores reviews the user RECEIVED", () => {
    const events = [
      makeEvent({ kind: "review_received", actorIsOwner: true }),
      makeEvent({ kind: "review_received", actorIsOwner: false }),
    ];

    expect(deriveCandidateEvidence(events, WINDOW).reviewGiven).toBeNull();
  });
});

describe("deriveCandidateEvidence — month density per technology", () => {
  const longWindow = { from: "2026-01-01", to: "2026-04-30" };

  it("counts distinct MONTHS, not events", () => {
    const events = [
      makeEvent({ occurredOn: "2026-01-05", technologies: ["TypeScript"] }),
      makeEvent({ occurredOn: "2026-01-19", technologies: ["TypeScript"] }),
      makeEvent({ occurredOn: "2026-01-28", technologies: ["TypeScript"] }),
      makeEvent({ occurredOn: "2026-03-02", technologies: ["TypeScript"] }),
    ];

    const [densityClaim] = deriveCandidateEvidence(
      events,
      longWindow,
    ).technologyMonthDensity;
    const claim = expectDefined(densityClaim, "the month-density claim");

    // Four events, two months. This is the difference between a density claim
    // and the event count it deliberately replaces.
    expect(claim.activeMonths).toBe(2);
    expect(claim.windowMonths).toBe(4);
  });

  it("counts a technology repeated on one event once", () => {
    const events = [
      makeEvent({
        occurredOn: "2026-01-05",
        technologies: ["Go", "Go", "Go"],
      }),
    ];

    expect(
      deriveCandidateEvidence(events, longWindow).technologyMonthDensity[0]
        ?.activeMonths,
    ).toBe(1);
  });

  it("orders technologies by density, then alphabetically, so a post is reproducible", () => {
    const events = [
      makeEvent({
        occurredOn: "2026-01-05",
        technologies: ["TypeScript", "Go", "Rust"],
      }),
      makeEvent({
        occurredOn: "2026-02-05",
        technologies: ["TypeScript", "Go"],
      }),
      makeEvent({ occurredOn: "2026-03-05", technologies: ["TypeScript"] }),
    ];

    expect(
      deriveCandidateEvidence(events, longWindow).technologyMonthDensity.map(
        (claim) => `${claim.technology}:${claim.activeMonths}`,
      ),
    ).toEqual(["TypeScript:3", "Go:2", "Rust:1"]);
  });
});

describe("deriveCandidateEvidence — recency and consistency", () => {
  it("reports active weeks as a fraction of the window, never as a streak", () => {
    const window = { from: "2026-05-20", to: "2026-08-14" };
    const events = [
      makeEvent({ occurredOn: "2026-05-21" }),
      makeEvent({ occurredOn: "2026-05-22" }),
      makeEvent({ occurredOn: "2026-06-10" }),
      makeEvent({ occurredOn: "2026-08-14" }),
    ];

    const claim = deriveCandidateEvidence(events, window).recency;

    // Two events in the same ISO week are one active week.
    expect(claim?.activeWeeks).toBe(3);
    expect(claim?.windowWeeks).toBe(13);
    // A streak field would be fabricable and would manufacture pressure not to
    // take a week off. There must not be one.
    expect(claim).not.toHaveProperty("streak");
    expect(claim).not.toHaveProperty("currentStreak");
  });
});

describe("deriveCandidateEvidence — sustained engagement", () => {
  const window = { from: "2026-01-01", to: "2026-06-30" };

  it("measures depth on the single deepest codebase, not breadth across many", () => {
    const events = [
      makeEvent({ occurredOn: "2026-01-05", repoFingerprint: REPO_A }),
      makeEvent({ occurredOn: "2026-02-05", repoFingerprint: REPO_A }),
      makeEvent({ occurredOn: "2026-03-05", repoFingerprint: REPO_A }),
      makeEvent({ occurredOn: "2026-04-05", repoFingerprint: REPO_B }),
    ];

    const claim = deriveCandidateEvidence(events, window).sustainedEngagement;

    expect(claim?.activeMonthsOnDeepestCodebase).toBe(3);
    expect(claim?.codebaseCount).toBe(2);
  });

  it("withholds the claim when no codebase has more than one active month", () => {
    const events = [
      makeEvent({ occurredOn: "2026-01-05", repoFingerprint: REPO_A }),
      makeEvent({ occurredOn: "2026-01-06", repoFingerprint: REPO_B }),
    ];

    expect(
      deriveCandidateEvidence(events, window).sustainedEngagement,
    ).toBeNull();
  });
});

describe("deriveCandidateEvidence — release participation", () => {
  it("counts releases and the months they are spread over", () => {
    const window = { from: "2026-01-01", to: "2026-03-31" };
    const events = [
      makeEvent({ kind: "release", occurredOn: "2026-01-05" }),
      makeEvent({ kind: "release", occurredOn: "2026-01-20" }),
      makeEvent({ kind: "release", occurredOn: "2026-03-05" }),
      makeEvent({ kind: "commit", occurredOn: "2026-02-05" }),
    ];

    const claim = deriveCandidateEvidence(events, window).releaseParticipation;

    expect(claim?.releaseCount).toBe(3);
    expect(claim?.activeMonths).toBe(2);
  });
});

describe("deriveCandidateEvidence — commit counts", () => {
  it("computes the commit count but never exposes it as a claim", () => {
    const events = [
      makeEvent({ kind: "commit" }),
      makeEvent({ kind: "commit" }),
      makeEvent({ kind: "pull_request_merged" }),
    ];

    const evidence = deriveCandidateEvidence(events, WINDOW);

    expect(evidence.internalCommitCount).toBe(2);
    // `GIT_AUTHOR_DATE` is a client-side env var, so this number is forgeable
    // with a shell loop. It may inform a provenance panel; it may never be a
    // claim standing next to numbers other people vouched for.
    expect(evidence.claims.map((claim) => claim.kind)).not.toContain(
      "commit_count",
    );
  });

  it("does not consider a week of nothing but commits publishable", () => {
    const evidence = deriveCandidateEvidence(
      [makeEvent({ kind: "commit" }), makeEvent({ kind: "commit" })],
      WINDOW,
    );

    expect(evidence.internalCommitCount).toBe(2);
    expect(hasPublishableEvidence(evidence)).toBe(false);
  });

  it("considers any warranted claim publishable", () => {
    for (const kind of ["pull_request_merged", "release"] as const) {
      expect(
        hasPublishableEvidence(
          deriveCandidateEvidence([makeEvent({ kind })], WINDOW),
        ),
      ).toBe(true);
    }

    expect(
      hasPublishableEvidence(
        deriveCandidateEvidence(
          [makeEvent({ kind: "review_submitted", actorIsOwner: false })],
          WINDOW,
        ),
      ),
    ).toBe(true);
  });
});

describe("deriveCandidateEvidence — provenance", () => {
  it("gives every claim its window, sources, kinds and event count", () => {
    const events = [
      makeEvent({ kind: "pull_request_merged", source: "github" }),
      makeEvent({ kind: "pull_request_merged", source: "gitlab" }),
      makeEvent({ kind: "release", source: "github" }),
    ];

    const evidence = deriveCandidateEvidence(events, WINDOW);

    for (const claim of evidence.claims) {
      expect(claim.provenance.window).toEqual(WINDOW);
      expect(claim.provenance.eventCount).toBeGreaterThan(0);
      expect(claim.provenance.sources.length).toBeGreaterThan(0);
    }

    const merged = evidence.thirdPartyWarrantedWork!;
    expect(merged.provenance.eventCount).toBe(2);
    expect(merged.provenance.sources).toEqual(["github", "gitlab"]);
    expect(merged.provenance.kinds).toEqual(["pull_request_merged"]);
  });
});

describe("deriveCandidateEvidence — identity leakage", () => {
  /**
   * Structural, not incidental. Only fingerprints are ever stored, and no
   * fingerprint is copied onto a claim — the claims carry counts. Serialising
   * the whole evidence object and searching for the fixture's fingerprints is
   * the cheapest way to prove a future field cannot quietly reintroduce one.
   */
  it("never carries a repository or counterparty fingerprint onto the evidence", () => {
    const events = [
      makeEvent({
        kind: "pull_request_merged",
        repoFingerprint: REPO_A,
        counterpartyFingerprints: [REVIEWER_1, REVIEWER_2],
      }),
      makeEvent({
        kind: "review_submitted",
        actorIsOwner: false,
        repoFingerprint: REPO_B,
        counterpartyFingerprints: [REVIEWER_3],
      }),
    ];

    const serialized = JSON.stringify(deriveCandidateEvidence(events, WINDOW));

    for (const fingerprint of [
      REPO_A,
      REPO_B,
      REVIEWER_1,
      REVIEWER_2,
      REVIEWER_3,
    ]) {
      expect(serialized).not.toContain(fingerprint);
    }
  });

  it("has no field derived from hour of day or timezone", () => {
    const serialized = JSON.stringify(
      deriveCandidateEvidence([makeEvent({ kind: "release" })], WINDOW),
    );

    // The ingestion schema refuses timestamps, so an aggregate that contained
    // one could only have invented it.
    expect(serialized).not.toMatch(/T\d{2}:\d{2}/);
    expect(serialized).not.toMatch(/hour|timezone|utcOffset/i);
  });
});

describe("BuildCandidateEvidenceUseCase", () => {
  let activityEventRepository: InMemoryActivityEventRepository;
  let sut: BuildCandidateEvidenceUseCase;

  beforeEach(() => {
    activityEventRepository = new InMemoryActivityEventRepository();
    sut = new BuildCandidateEvidenceUseCase(activityEventRepository);
  });

  it("builds evidence from the events inside the window only", async () => {
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged", occurredOn: "2026-08-10" }),
    );
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged", occurredOn: "2026-08-01" }),
    );

    const evidence = await sut.execute({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      window: WINDOW,
    });

    expect(evidence.thirdPartyWarrantedWork?.mergedChangeCount).toBe(1);
    expect(evidence.totalEventCount).toBe(1);
  });

  it("never mixes another user's events into a connection's evidence", async () => {
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged" }),
    );
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged", userId: "someone-else" }),
    );

    const evidence = await sut.execute({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      window: WINDOW,
    });

    expect(evidence.thirdPartyWarrantedWork?.mergedChangeCount).toBe(1);
  });

  it("returns empty evidence for an inverted window instead of throwing", async () => {
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged" }),
    );

    const evidence = await sut.execute({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      window: { from: "2026-08-15", to: "2026-08-14" },
    });

    expect(evidence.totalEventCount).toBe(0);
    expect(hasPublishableEvidence(evidence)).toBe(false);
  });

  it("falls back to the whole user's activity when no connection is given", async () => {
    await activityEventRepository.create(
      makeEvent({ kind: "pull_request_merged", connectionId: "other" }),
    );

    const evidence = await sut.execute({ userId: USER_ID, window: WINDOW });

    expect(evidence.thirdPartyWarrantedWork?.mergedChangeCount).toBe(1);
  });
});
