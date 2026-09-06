import type { ActivityEventKind, ActivitySource } from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ActivityEventEntityProps extends BaseEntityProps {
  userId: string;
  connectionId: string;
  source: ActivitySource;
  /**
   * The delivering system's own id: X-GitHub-Delivery, the GitLab webhook id,
   * `${sessionId}:${turn}` for the Claude Code hook, the extractor's upload id.
   */
  externalDeliveryId: string;
  kind: ActivityEventKind;
  /**
   * `YYYY-MM-DD`. A DATE and not a timestamp, deliberately: bucketing to the day
   * is the coarsest granularity that still answers the per-week and per-month
   * questions the digests ask, and it keeps hour-of-day — which would publish
   * the user's sleep schedule — out of the system entirely.
   */
  occurredOn: string;
  /** A hash of the repository identity. Never a repository name. */
  repoFingerprint: string;
  /** Normalized language/framework tags. */
  technologies: string[];
  /** False when this event is third-party warranting, e.g. a review the user GAVE. */
  actorIsOwner: boolean;
  /**
   * HASHED distinct reviewer/approver ids, hashed at ingestion. This is what
   * makes "approved by 9 distinct reviewers" computable without this product
   * ever holding the identity of a person who never signed up for it.
   */
  counterpartyFingerprints: string[];
  /** Already-redacted context only. A raw webhook body must never reach here. */
  payload: Record<string, unknown> | null;
}

/**
 * One delivered unit of developer activity.
 *
 * Append-only: there is no `updateContent`, and the table has no `updated_at`.
 * A redelivery is not an edit — it collides on `(source, externalDeliveryId)`
 * and is dropped — which is what makes webhook retries, manual resends and a
 * double-firing hook free no-ops rather than duplicated history.
 */
export class ActivityEventEntity extends BaseEntity<ActivityEventEntityProps> {
  userId: string;
  connectionId: string;
  source: ActivitySource;
  externalDeliveryId: string;
  kind: ActivityEventKind;
  occurredOn: string;
  repoFingerprint: string;
  technologies: string[];
  actorIsOwner: boolean;
  counterpartyFingerprints: string[];
  payload: Record<string, unknown> | null;

  constructor(props: ActivityEventEntityProps) {
    super(props);
    this.userId = props.userId;
    this.connectionId = props.connectionId;
    this.source = props.source;
    this.externalDeliveryId = props.externalDeliveryId;
    this.kind = props.kind;
    this.occurredOn = props.occurredOn;
    this.repoFingerprint = props.repoFingerprint;
    this.technologies = props.technologies ?? [];
    this.actorIsOwner = props.actorIsOwner;
    this.counterpartyFingerprints = props.counterpartyFingerprints ?? [];
    this.payload = props.payload ?? null;
  }

  /**
   * The idempotency key, in the same shape as the table's unique constraint.
   * Exists so the in-memory repository and Postgres cannot drift apart on what
   * counts as "the same delivery".
   */
  dedupeKey(): string {
    return `${this.source}:${this.externalDeliveryId}`;
  }

  /** How many distinct people were on the other side of this event. */
  distinctCounterpartyCount(): number {
    return new Set(this.counterpartyFingerprints).size;
  }

  /** `YYYY-MM`, the aggregation bucket the DATE column exists to support. */
  monthBucket(): string {
    return this.occurredOn.slice(0, 7);
  }

  /**
   * The ISO-8601 week this event falls in, as `YYYY-Www`.
   *
   * Computed from the date alone — no clock, no timezone — so the same event
   * buckets identically wherever it is aggregated. ISO weeks start on Monday
   * and the week-numbering year can differ from the calendar year around
   * New Year, which is why the year is taken from the Thursday of the week.
   */
  weekBucket(): string {
    // `undefined` and `NaN` both make `Date.UTC` an Invalid Date, so the
    // fallbacks preserve what a malformed `occurredOn` already did while giving
    // the parts an honest `number` type under `noUncheckedIndexedAccess`.
    const [year, month, day] = this.occurredOn.split("-").map(Number);
    const date = new Date(
      Date.UTC(
        year ?? Number.NaN,
        (month ?? Number.NaN) - 1,
        day ?? Number.NaN,
      ),
    );

    // Shift to the Thursday of this ISO week (Sunday counts as day 7).
    const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + 4 - isoDayOfWeek);

    const isoYear = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstIsoDayOfWeek =
      firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
    firstThursday.setUTCDate(
      firstThursday.getUTCDate() + 4 - firstIsoDayOfWeek,
    );

    const week =
      1 +
      Math.round(
        (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );

    return `${isoYear}-W${String(week).padStart(2, "0")}`;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      connectionId: this.connectionId,
      source: this.source,
      externalDeliveryId: this.externalDeliveryId,
      kind: this.kind,
      occurredOn: this.occurredOn,
      repoFingerprint: this.repoFingerprint,
      technologies: this.technologies,
      actorIsOwner: this.actorIsOwner,
      counterpartyFingerprints: this.counterpartyFingerprints,
      payload: this.payload,
      createdAt: this.createdAt,
    };
  }
}
