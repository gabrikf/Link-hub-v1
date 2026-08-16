import { describe, expect, it } from "vitest";
import type { ActivitySource } from "@repo/schemas";
import { ActivityEventEntity } from "./activity-event-entity.js";

function makeEvent(
  overrides: {
    source?: ActivitySource;
    externalDeliveryId?: string;
    occurredOn?: string;
    counterpartyFingerprints?: string[];
  } = {},
) {
  return ActivityEventEntity.create({
    userId: "user-1",
    connectionId: "conn-1",
    source: overrides.source ?? "github",
    externalDeliveryId: overrides.externalDeliveryId ?? "delivery-1",
    kind: "commit",
    occurredOn: overrides.occurredOn ?? "2026-03-10",
    repoFingerprint: "a".repeat(64),
    technologies: ["typescript"],
    actorIsOwner: true,
    counterpartyFingerprints: overrides.counterpartyFingerprints ?? [],
    payload: null,
  });
}

describe("ActivityEventEntity", () => {
  it("keys deduplication on the source/delivery pair", () => {
    // This is the entity's copy of the table's unique constraint, and the
    // reason the in-memory repository and Postgres cannot drift apart on what
    // counts as "the same delivery".
    const event = makeEvent({ source: "hook", externalDeliveryId: "s-1:4" });
    expect(event.dedupeKey()).toBe("hook:s-1:4");

    expect(
      makeEvent({ source: "gitlab", externalDeliveryId: "1" }).dedupeKey(),
    ).not.toBe(
      makeEvent({ source: "github", externalDeliveryId: "1" }).dedupeKey(),
    );
  });

  it("counts DISTINCT counterparties", () => {
    // "Approved by N distinct reviewers" has to be computable from hashes
    // alone; the same reviewer approving twice is still one person.
    const event = makeEvent({
      counterpartyFingerprints: ["b".repeat(64), "b".repeat(64), "c".repeat(64)],
    });

    expect(event.counterpartyFingerprints).toHaveLength(3);
    expect(event.distinctCounterpartyCount()).toBe(2);
  });

  it("buckets to the calendar month", () => {
    expect(makeEvent({ occurredOn: "2026-03-10" }).monthBucket()).toBe(
      "2026-03",
    );
    expect(makeEvent({ occurredOn: "2026-12-31" }).monthBucket()).toBe(
      "2026-12",
    );
  });

  it("buckets to the ISO week from the date alone", () => {
    // Mon 2026-03-09 through Sun 2026-03-15 are one ISO week.
    expect(makeEvent({ occurredOn: "2026-03-09" }).weekBucket()).toBe(
      "2026-W11",
    );
    expect(makeEvent({ occurredOn: "2026-03-15" }).weekBucket()).toBe(
      "2026-W11",
    );
    expect(makeEvent({ occurredOn: "2026-03-16" }).weekBucket()).toBe(
      "2026-W12",
    );
  });

  it("uses the ISO week-numbering year across New Year", () => {
    // The trap the Thursday shift exists for: these days are in the calendar
    // year they are not week-numbered by. Jan 1 2027 (a Friday) belongs to the
    // last week of 2026, and Dec 31 2024 (a Tuesday) to the first week of 2025.
    expect(makeEvent({ occurredOn: "2027-01-01" }).weekBucket()).toBe(
      "2026-W53",
    );
    expect(makeEvent({ occurredOn: "2024-12-31" }).weekBucket()).toBe(
      "2025-W01",
    );
  });
});
