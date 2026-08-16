import type { ActivitySource } from "@repo/schemas";
import { ActivityEventEntity } from "../../entity/activity-event/activity-event-entity.js";

/** Inclusive `YYYY-MM-DD` bounds, matching the DATE column the events are bucketed to. */
export interface ActivityEventDateRange {
  from: string;
  to: string;
}

/**
 * Outcome of an append.
 *
 * `duplicate` is a SUCCESS: it means `(source, externalDeliveryId)` was already
 * in the log, so the redelivery/resend/double-fire was absorbed. The convention
 * mirrors `RecordCandidateInteractionUseCase`'s `status: "recorded" | "duplicate"`
 * — the caller gets the row that exists either way and never has to interpret an
 * error to find out whether history was written twice.
 */
export interface RecordActivityEventResult {
  status: "recorded" | "duplicate";
  event: ActivityEventEntity;
}

/**
 * The cutoffs the health aggregates are computed against, as inclusive
 * `YYYY-MM-DD` lower bounds. Passed in rather than derived here: "the last 7
 * days" is the health read model's policy, and the repository only knows how
 * to count.
 */
export interface ConnectionActivityAggregateInput {
  /** Events on or after this date feed `recentEventCount`. */
  recentSince: string;
  /** Events on or after this date feed `distinctRepoCount`. */
  distinctReposSince: string;
}

/**
 * Counts and dates only — the shape `gitConnectionHealthSchema` promises. No
 * fingerprint ever leaves the repository through this read model, which is
 * what lets the UI poll it in a loop without becoming a leak.
 */
export interface ConnectionActivityAggregates {
  totalEvents: number;
  /** `YYYY-MM-DD` of the newest event, or null when nothing has arrived. */
  lastEventOn: string | null;
  recentEventCount: number;
  distinctRepoCount: number;
}

export interface IActivityEventRepository {
  create(event: ActivityEventEntity): Promise<RecordActivityEventResult>;
  findById(id: string): Promise<ActivityEventEntity | null>;
  findByDeliveryId(
    source: ActivitySource,
    externalDeliveryId: string,
  ): Promise<ActivityEventEntity | null>;
  /** One user's events over a date window — the shape every digest reads. */
  listByUserId(
    userId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]>;
  listByConnectionId(
    connectionId: string,
    range: ActivityEventDateRange,
  ): Promise<ActivityEventEntity[]>;
  /**
   * One connection's health counters, in a single pass. One method rather than
   * four so the Drizzle implementation can answer with one aggregate query
   * instead of four sequential scans of the same rows.
   */
  aggregateByConnectionId(
    connectionId: string,
    input: ConnectionActivityAggregateInput,
  ): Promise<ConnectionActivityAggregates>;
}
