import type { ActivityEventKind } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { deriveCandidateEvidence } from "../build-candidate-evidence-use-case/candidate-evidence.js";
import {
  resolveRecentWindow,
  resolveTrackRecordWindow,
} from "../shared/digest-window.js";
import { renderActivityDigest } from "./render-activity-digest.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

const REPO = "a".repeat(64);
let counter = 0;

function makeEvent(overrides: {
  kind?: ActivityEventKind;
  occurredOn?: string;
  technologies?: string[];
  actorIsOwner?: boolean;
  counterpartyFingerprints?: string[];
  repoFingerprint?: string;
}): ActivityEventEntity {
  counter += 1;

  return ActivityEventEntity.create({
    userId: "user-1",
    connectionId: "connection-1",
    source: "github",
    externalDeliveryId: `delivery-${counter}`,
    kind: overrides.kind ?? "commit",
    occurredOn: overrides.occurredOn ?? "2026-08-10",
    repoFingerprint: overrides.repoFingerprint ?? REPO,
    technologies: overrides.technologies ?? [],
    actorIsOwner: overrides.actorIsOwner ?? true,
    counterpartyFingerprints: overrides.counterpartyFingerprints ?? [],
    payload: null,
  });
}

const PERIOD_WINDOW = { from: "2026-08-08", to: "2026-08-14" };
const RECENT_WINDOW = resolveRecentWindow(PERIOD_WINDOW);
const TRACK_RECORD_WINDOW = resolveTrackRecordWindow(PERIOD_WINDOW);

function fingerprints(count: number, seed: string): string[] {
  return Array.from({ length: count }, (_, index) =>
    `${seed}${index}`.padEnd(64, "f"),
  );
}

function buildRichDigest(blockedTerms: string[] = []) {
  const periodEvents = [
    ...Array.from({ length: 23 }, (_, index) =>
      makeEvent({
        kind: "pull_request_merged",
        technologies: ["TypeScript", "PostgreSQL"],
        // Nine distinct reviewers spread across 23 merges.
        counterpartyFingerprints: fingerprints(3, `r${index % 3}`),
      }),
    ),
    ...Array.from({ length: 12 }, () =>
      makeEvent({
        kind: "review_submitted",
        actorIsOwner: false,
        counterpartyFingerprints: fingerprints(2, "author"),
      }),
    ),
    makeEvent({ kind: "release" }),
    makeEvent({ kind: "release" }),
  ];

  // One event a month for 40 of the 48 months in the lookback.
  const trackRecordEvents = [
    ...Array.from({ length: 40 }, (_, index) =>
      makeEvent({
        kind: "commit",
        occurredOn: `${2023 + Math.floor(index / 12)}-${String(
          (index % 12) + 1,
        ).padStart(2, "0")}-05`,
        technologies: ["TypeScript"],
      }),
    ),
    makeEvent({
      kind: "commit",
      occurredOn: "2025-01-05",
      technologies: ["Go"],
    }),
    makeEvent({
      kind: "commit",
      occurredOn: "2025-02-05",
      technologies: ["Go"],
    }),
  ];

  // Eleven of the thirteen recent weeks have activity.
  const recentEvents = Array.from({ length: 11 }, (_, index) =>
    makeEvent({
      kind: "commit",
      occurredOn: addWeeks(RECENT_WINDOW.from, index),
    }),
  );

  return renderActivityDigest({
    period: deriveCandidateEvidence(periodEvents, PERIOD_WINDOW),
    recent: deriveCandidateEvidence(recentEvents, RECENT_WINDOW),
    trackRecord: deriveCandidateEvidence(
      trackRecordEvents,
      TRACK_RECORD_WINDOW,
    ),
    blockedTerms,
  });
}

function addWeeks(date: string, weeks: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + weeks * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe("renderActivityDigest", () => {
  it("leads with the strongest warranted claim, not with a 'weekly update'", () => {
    const { title } = buildRichDigest();

    expect(title).toBe("Merged 23 changes, approved by 9 reviewers");
    expect(title.length).toBeLessThanOrEqual(70);
    // The house guide calls this phrasing out by name as the weak version.
    expect(title.toLowerCase()).not.toContain("weekly update");
    // Titles carry no trailing punctuation.
    expect(title.endsWith(".")).toBe(false);
  });

  it("is byte-identical for the same evidence — no model anywhere in the path", () => {
    expect(buildRichDigest().body).toBe(buildRichDigest().body);
  });

  it("renders the merge count and the distinct-approver count together", () => {
    // The pair is the claim. Rendering the merge count alone would be the
    // self-assertable vanity metric this shape exists to replace.
    expect(buildRichDigest().body).toContain(
      "Merged 23 changes, approved by 9 distinct reviewers.",
    );
  });

  it("renders review given as work done for other people", () => {
    expect(buildRichDigest().body).toContain(
      "Reviewed 12 changes authored by 2 other engineers.",
    );
  });

  it("renders month density as a fraction of the tenure window, never as 'since <year>'", () => {
    const body = buildRichDigest().body;

    expect(body).toContain("Worked in TypeScript in 40 of the last 48 months");
    expect(body).not.toMatch(/since \d{4}/i);
  });

  it("renders consistency as a fraction and never as a streak", () => {
    const body = buildRichDigest().body;

    expect(body).toMatch(/Active in \d+ of the last \d+ weeks/);
    expect(body.toLowerCase()).not.toContain("streak");
    expect(body.toLowerCase()).not.toContain("day in a row");
  });

  it("never promotes the commit count", () => {
    const body = buildRichDigest().body;

    // 40 commits went into the track record and 0 into the period; neither may
    // appear as a claim. See the rationale in candidate-evidence.ts.
    expect(body.toLowerCase()).not.toContain("commit");
  });

  it("stays inside the house style budget", () => {
    const { body } = buildRichDigest();
    const bullets = body.split("\n").filter((line) => line.startsWith("- "));

    expect(bullets.length).toBeGreaterThanOrEqual(2);
    expect(bullets.length).toBeLessThanOrEqual(5);
    expect(body.split(/\s+/).length).toBeLessThan(200);
    expect(body).not.toContain("!");
    // No headings: the guide says most posts need none, and a digest is short.
    expect(body).not.toMatch(/^#/m);
  });

  it("names the stack, because that is the searchable part", () => {
    const rendered = buildRichDigest();

    expect(rendered.body).toContain("PostgreSQL");
    expect(rendered.body).toContain("TypeScript");
    expect(rendered.tags).toEqual(["postgresql", "typescript"]);
  });

  it("drops a technology tag that collides with a blocked term", () => {
    // Tags are the only text in the template that came from outside it, so
    // they are the only way an employer name could reach a deterministic post.
    const rendered = buildRichDigest(["PostgreSQL"]);

    expect(rendered.body).not.toContain("PostgreSQL");
    expect(rendered.tags).toEqual(["typescript"]);
  });

  it("falls back through the claim hierarchy when there are no merges", () => {
    const reviewsOnly = deriveCandidateEvidence(
      Array.from({ length: 5 }, () =>
        makeEvent({
          kind: "review_submitted",
          actorIsOwner: false,
          counterpartyFingerprints: fingerprints(1, "a"),
        }),
      ),
      PERIOD_WINDOW,
    );

    expect(
      renderActivityDigest({
        period: reviewsOnly,
        recent: reviewsOnly,
        trackRecord: reviewsOnly,
        blockedTerms: [],
      }).title,
    ).toBe("Reviewed 5 changes from 1 engineer");

    const releasesOnly = deriveCandidateEvidence(
      [makeEvent({ kind: "release" })],
      PERIOD_WINDOW,
    );

    expect(
      renderActivityDigest({
        period: releasesOnly,
        recent: releasesOnly,
        trackRecord: releasesOnly,
        blockedTerms: [],
      }).title,
    ).toBe("Shipped 1 release");
  });

  it("carries no repository or reviewer identity into the rendered text", () => {
    const reviewer = expectDefined(
      fingerprints(1, "secret")[0],
      "the single generated reviewer fingerprint",
    );
    const evidence = deriveCandidateEvidence(
      [
        makeEvent({
          kind: "pull_request_merged",
          repoFingerprint: REPO,
          counterpartyFingerprints: [reviewer],
        }),
      ],
      PERIOD_WINDOW,
    );

    const rendered = renderActivityDigest({
      period: evidence,
      recent: evidence,
      trackRecord: evidence,
      blockedTerms: [],
    });

    const serialized = JSON.stringify(rendered);
    expect(serialized).not.toContain(REPO);
    expect(serialized).not.toContain(reviewer);
  });
});
