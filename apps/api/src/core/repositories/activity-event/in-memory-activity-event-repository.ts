import type { ActivitySource } from "@repo/schemas";
import { ActivityEventEntity } from "../../entity/activity-event/activity-event-entity.js";
import {
  ActivityEventDateRange,
  ConnectionActivityAggregateInput,
  ConnectionActivityAggregates,
  IActivityEventRepository,
  RecordActivityEventResult,
} from "./activity-event-repository.js";

export class InMemoryActivityEventRepository
  implements IActivityEventRepository
{
  public items: ActivityEventEntity[] = [];

  /**
   * Enforces the same `UNIQUE (source, external_delivery_id)` the table does,
   * by the same key the entity exposes. Without this the in-memory repository
   * would happily accept a redelivery and every idempotency test would pass
   * against a store that does not behave like production.
   */
  async create(event: ActivityEventEntity): Promise<RecordActivityEventResult> {
    const existing = this.items.find(
      (item) => item.dedupeKey() === event.dedupeKey(),
    );

    if (existing) {
      return { status: "duplicate", event: existing };
    }

    this.items.push(event);
    return { status: "recorded", event };
  }

  async findById(id: string): Promise<ActivityEventEntity | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByDeliveryId(
    source: ActivitySource,
    externalDeliveryId: string,
  ): Promise<ActivityEventEntity | null> {
    return (
      this.items.find(
        (item) =>
          item.source === source &&
          item.externalDeliveryId === externalDeliveryId,
      ) ?? null
    );
  }

  async listByUserId(
    userId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]> {
    return this.sorted(
      this.items.filter(
        (item) => item.userId === userId && inRange(item.occurredOn, range),
      ),
    );
  }

  async listByConnectionId(
    connectionId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]> {
    return this.sorted(
      this.items.filter(
        (item) =>
          item.connectionId === connectionId &&
          inRange(item.occurredOn, range),
      ),
    );
  }

  async aggregateByConnectionId(
    connectionId: string,
    input: ConnectionActivityAggregateInput,
  ): Promise<ConnectionActivityAggregates> {
    const events = this.items.filter(
      (item) => item.connectionId === connectionId,
    );

    let lastEventOn: string | null = null;
    let recentEventCount = 0;
    const repos = new Set<string>();

    for (const event of events) {
      if (lastEventOn === null || event.occurredOn > lastEventOn) {
        lastEventOn = event.occurredOn;
      }
      if (event.occurredOn >= input.recentSince) {
        recentEventCount += 1;
      }
      if (event.occurredOn >= input.distinctReposSince) {
        repos.add(event.repoFingerprint);
      }
    }

    return {
      totalEvents: events.length,
      lastEventOn,
      recentEventCount,
      distinctRepoCount: repos.size,
    };
  }

  private sorted(events: ActivityEventEntity[]): ActivityEventEntity[] {
    return [...events].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  }

  clear() {
    this.items = [];
  }
}

/** `YYYY-MM-DD` sorts lexicographically, so string comparison is date comparison. */
function inRange(occurredOn: string, range: ActivityEventDateRange): boolean {
  return occurredOn >= range.from && occurredOn <= range.to;
}
