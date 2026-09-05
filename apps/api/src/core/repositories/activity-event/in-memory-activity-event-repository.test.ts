import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityEventKind, ActivitySource } from "@repo/schemas";
import { ActivityEventEntity } from "../../entity/activity-event/activity-event-entity.js";
import { InMemoryActivityEventRepository } from "./in-memory-activity-event-repository.js";

function makeEvent(
  overrides: {
    userId?: string;
    connectionId?: string;
    source?: ActivitySource;
    externalDeliveryId?: string;
    kind?: ActivityEventKind;
    occurredOn?: string;
    technologies?: string[];
    counterpartyFingerprints?: string[];
  } = {},
) {
  return ActivityEventEntity.create({
    userId: overrides.userId ?? "user-1",
    connectionId: overrides.connectionId ?? "conn-1",
    source: overrides.source ?? "github",
    externalDeliveryId: overrides.externalDeliveryId ?? "delivery-1",
    kind: overrides.kind ?? "commit",
    occurredOn: overrides.occurredOn ?? "2026-03-10",
    repoFingerprint: "a".repeat(64),
    technologies: overrides.technologies ?? ["typescript"],
    actorIsOwner: true,
    counterpartyFingerprints: overrides.counterpartyFingerprints ?? [],
    payload: null,
  });
}

describe("InMemoryActivityEventRepository — idempotency", () => {
  let repository: InMemoryActivityEventRepository;

  beforeEach(() => {
    repository = new InMemoryActivityEventRepository();
  });

  /**
   * The behaviour the `UNIQUE (source, external_delivery_id)` index buys, and
   * the reason the in-memory store enforces it too: a webhook redelivery, a
   * manual resend and a double-firing Claude Code hook are all normal, and each
   * one must be a free no-op rather than an error the ingestion endpoint has to
   * classify — or, worse, a second row of duplicated history.
   */
  it("absorbs a redelivery as a duplicate instead of throwing", async () => {
    const first = await repository.create(makeEvent());
    expect(first.status).toBe("recorded");

    // A redelivery carries the same delivery id but is a brand new entity —
    // different row id, and possibly a different payload — exactly like a
    // second POST would be.
    const redelivery = makeEvent();
    expect(redelivery.id).not.toBe(first.event.id);

    const second = await repository.create(redelivery);

    expect(second.status).toBe("duplicate");
    // The row that already exists is what comes back, so the caller can link to
    // real history rather than to an event that was never stored.
    expect(second.event.id).toBe(first.event.id);
    expect(repository.items).toHaveLength(1);
  });

  it("treats the same delivery id from a different source as a new event", async () => {
    // The key is the PAIR. A GitLab delivery numbered "1" and a hook delivery
    // numbered "1" are unrelated events, and collapsing them would silently
    // drop real activity.
    const a = await repository.create(
      makeEvent({ source: "github", externalDeliveryId: "1" }),
    );
    const b = await repository.create(
      makeEvent({ source: "gitlab", externalDeliveryId: "1" }),
    );

    expect(a.status).toBe("recorded");
    expect(b.status).toBe("recorded");
    expect(repository.items).toHaveLength(2);
  });

  it("is deduped across connections, because the key does not include one", async () => {
    await repository.create(
      makeEvent({ connectionId: "conn-1", externalDeliveryId: "dup" }),
    );
    const second = await repository.create(
      makeEvent({ connectionId: "conn-2", externalDeliveryId: "dup" }),
    );

    expect(second.status).toBe("duplicate");
    expect(repository.items).toHaveLength(1);
  });

  it("finds a stored event by its delivery id", async () => {
    const { event } = await repository.create(
      makeEvent({ source: "hook", externalDeliveryId: "session-7:3" }),
    );

    await expect(
      repository.findByDeliveryId("hook", "session-7:3"),
    ).resolves.toMatchObject({ id: event.id });
    await expect(
      repository.findByDeliveryId("github", "session-7:3"),
    ).resolves.toBeNull();
    await expect(repository.findById(event.id)).resolves.toMatchObject({
      id: event.id,
    });
  });
});

describe("InMemoryActivityEventRepository — digest windows", () => {
  let repository: InMemoryActivityEventRepository;

  beforeEach(async () => {
    repository = new InMemoryActivityEventRepository();

    await repository.create(
      makeEvent({ externalDeliveryId: "d1", occurredOn: "2026-03-01" }),
    );
    await repository.create(
      makeEvent({ externalDeliveryId: "d2", occurredOn: "2026-03-31" }),
    );
    await repository.create(
      makeEvent({ externalDeliveryId: "d3", occurredOn: "2026-04-01" }),
    );
    await repository.create(
      makeEvent({
        externalDeliveryId: "d4",
        occurredOn: "2026-03-15",
        userId: "user-2",
        connectionId: "conn-2",
      }),
    );
  });

  it("returns one user's events over an inclusive date window", async () => {
    const events = await repository.listByUserId("user-1", {
      from: "2026-03-01",
      to: "2026-03-31",
    });

    // Both bounds are inclusive: a digest window names the days it covers, so
    // dropping either end would silently lose a day of activity per run.
    expect(events.map((event) => event.occurredOn)).toEqual([
      "2026-03-01",
      "2026-03-31",
    ]);
  });

  it("never returns another user's events", async () => {
    const events = await repository.listByUserId("user-1", {
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(events.every((event) => event.userId === "user-1")).toBe(true);
  });

  it("scopes a window to one connection", async () => {
    const events = await repository.listByConnectionId("conn-2", {
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.occurredOn).toBe("2026-03-15");
  });

  it("returns events in chronological order", async () => {
    const events = await repository.listByUserId("user-1", {
      from: "2026-01-01",
      to: "2026-12-31",
    });

    const dates = events.map((event) => event.occurredOn);
    expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
  });
});
