import { and, asc, between, eq, sql } from "drizzle-orm";
import type { ActivityEventKind, ActivitySource } from "@repo/schemas";
import { ActivityEventEntity } from "../../../../core/entity/activity-event/activity-event-entity.js";
import {
  ActivityEventDateRange,
  ConnectionActivityAggregateInput,
  ConnectionActivityAggregates,
  IActivityEventRepository,
  RecordActivityEventResult,
} from "../../../../core/repositories/activity-event/activity-event-repository.js";
import { db } from "../index.js";
import { activityEvents } from "../schema.js";

type ActivityEventRow = typeof activityEvents.$inferSelect;

function toEntity(row: ActivityEventRow): ActivityEventEntity {
  return new ActivityEventEntity({
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    source: row.source as ActivitySource,
    externalDeliveryId: row.externalDeliveryId,
    kind: row.kind as ActivityEventKind,
    occurredOn: row.occurredOn,
    repoFingerprint: row.repoFingerprint,
    technologies: row.technologies,
    actorIsOwner: row.actorIsOwner,
    counterpartyFingerprints: row.counterpartyFingerprints,
    payload: row.payload as Record<string, unknown> | null,
    createdAt: row.createdAt,
    // The table has no `updated_at` — an activity event is append-only, so it
    // is never updated. `BaseEntity` requires the field, so it mirrors
    // `createdAt` rather than inventing a time nothing happened at.
    updatedAt: row.createdAt,
  });
}

export class DrizzleActivityEventRepository implements IActivityEventRepository {
  /**
   * Append, absorbing a redelivery instead of failing on it.
   *
   * `onConflictDoNothing` lets `UNIQUE (source, external_delivery_id)` — not an
   * application-side "did we already see this?" read — be what decides. A
   * check-then-insert would still race two concurrent deliveries of the same
   * webhook into a unique violation; letting Postgres arbitrate cannot.
   *
   * An empty `returning()` is exactly how the conflict announces itself, so the
   * row that already exists is read back and returned as `duplicate`. The caller
   * gets an entity either way and never has to interpret an error to learn
   * whether history was written twice.
   */
  async create(event: ActivityEventEntity): Promise<RecordActivityEventResult> {
    const [created] = await db
      .insert(activityEvents)
      .values({
        id: event.id,
        userId: event.userId,
        connectionId: event.connectionId,
        source: event.source,
        externalDeliveryId: event.externalDeliveryId,
        kind: event.kind,
        occurredOn: event.occurredOn,
        repoFingerprint: event.repoFingerprint,
        technologies: event.technologies,
        actorIsOwner: event.actorIsOwner,
        counterpartyFingerprints: event.counterpartyFingerprints,
        payload: event.payload,
        createdAt: event.createdAt,
      })
      .onConflictDoNothing({
        target: [activityEvents.source, activityEvents.externalDeliveryId],
      })
      .returning();

    if (created) {
      return { status: "recorded", event: toEntity(created) };
    }

    const existing = await this.findByDeliveryId(
      event.source,
      event.externalDeliveryId,
    );

    if (!existing) {
      // The insert did nothing and no colliding row is visible. That is not a
      // duplicate — it is a constraint firing for a reason this code does not
      // model — and silently reporting success would drop the event.
      throw new Error(
        `Activity event '${event.dedupeKey()}' was neither inserted nor found`,
      );
    }

    return { status: "duplicate", event: existing };
  }

  async findById(id: string): Promise<ActivityEventEntity | null> {
    const [row] = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.id, id));

    return row ? toEntity(row) : null;
  }

  async findByDeliveryId(
    source: ActivitySource,
    externalDeliveryId: string,
  ): Promise<ActivityEventEntity | null> {
    const [row] = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.source, source),
          eq(activityEvents.externalDeliveryId, externalDeliveryId),
        ),
      );

    return row ? toEntity(row) : null;
  }

  async listByUserId(
    userId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]> {
    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.userId, userId),
          // Inclusive on both ends, matching the interface's contract and the
          // in-memory repository — a digest window names the days it covers.
          between(activityEvents.occurredOn, range.from, range.to),
        ),
      )
      .orderBy(asc(activityEvents.occurredOn));

    return rows.map(toEntity);
  }

  /**
   * One aggregate query, not four. The four counters all scan the same
   * connection's rows, so they are expressed as a single `count(*)` /
   * `max(...)` pass with `FILTER` clauses carrying the two date cutoffs —
   * Postgres reads the connection's index range once and answers everything.
   */
  async aggregateByConnectionId(
    connectionId: string,
    input: ConnectionActivityAggregateInput,
  ): Promise<ConnectionActivityAggregates> {
    const [row] = await db
      .select({
        totalEvents: sql<number>`count(*)::int`,
        lastEventOn: sql<string | null>`max(${activityEvents.occurredOn})`,
        recentEventCount: sql<number>`count(*) filter (where ${activityEvents.occurredOn} >= ${input.recentSince})::int`,
        distinctRepoCount: sql<number>`count(distinct ${activityEvents.repoFingerprint}) filter (where ${activityEvents.occurredOn} >= ${input.distinctReposSince})::int`,
      })
      .from(activityEvents)
      .where(eq(activityEvents.connectionId, connectionId));

    return {
      totalEvents: row?.totalEvents ?? 0,
      lastEventOn: row?.lastEventOn ?? null,
      recentEventCount: row?.recentEventCount ?? 0,
      distinctRepoCount: row?.distinctRepoCount ?? 0,
    };
  }

  async listByConnectionId(
    connectionId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]> {
    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.connectionId, connectionId),
          between(activityEvents.occurredOn, range.from, range.to),
        ),
      )
      .orderBy(asc(activityEvents.occurredOn));

    return rows.map(toEntity);
  }
}
