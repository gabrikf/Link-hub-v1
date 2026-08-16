import type {
  AgentDisclosureLevel,
  DigestCadence,
  GitConnectionKind,
  GitConnectionProvider,
} from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

/**
 * How many days a cadence waits before the next digest is due.
 *
 * `monthly` is absent because a month is not a number of days: it advances by a
 * calendar month below, otherwise a "monthly" digest would creep a day earlier
 * every 31-day month. `off` is absent because it never becomes due at all.
 */
const CADENCE_INTERVAL_DAYS: Record<"weekly" | "biweekly", number> = {
  weekly: 7,
  biweekly: 14,
};

export interface GitConnectionEntityProps extends BaseEntityProps {
  userId: string;
  provider: GitConnectionProvider;
  kind: GitConnectionKind;
  /** User-facing label, e.g. "Personal GitHub". Never derived from a repo or org name. */
  displayName: string;
  /** The forge account id, or null for local tools (`claude_code`, `extractor`). */
  externalAccountId: string | null;
  /**
   * The role a WORK connection belongs to. Null means the connection is not
   * attributed to a role, so it falls straight back to the account disclosure
   * level instead of a per-employer one.
   */
  workExperienceId: string | null;
  /** Per-connection override of the inherited level. Null = inherit. */
  disclosureLevelOverride: AgentDisclosureLevel | null;
  /** Shared secret used to verify forge webhook signatures. Never returned by a read path. */
  webhookSecret: string | null;
  autoPostEnabled: boolean;
  cadence: DigestCadence;
  /**
   * Opt-in for including the coding agent's own task summary prose in a digest.
   * Defaults to false at every layer and must stay that way.
   */
  includeAgentSummary: boolean;
  lastDigestAt: Date | null;
}

export interface UpdateGitConnectionEntityProps {
  displayName?: string;
  kind?: GitConnectionKind;
  externalAccountId?: string | null;
  workExperienceId?: string | null;
  disclosureLevelOverride?: AgentDisclosureLevel | null;
  webhookSecret?: string | null;
  autoPostEnabled?: boolean;
  cadence?: DigestCadence;
  includeAgentSummary?: boolean;
  lastDigestAt?: Date | null;
}

/**
 * A connected source of developer activity.
 *
 * The entity owns the two rules that would otherwise be re-derived (and
 * eventually disagree) in the ingestion path, the digest worker and the UI:
 * whether this connection's activity belongs to an employer, and whether it is
 * time to publish a digest.
 */
export class GitConnectionEntity extends BaseEntity<GitConnectionEntityProps> {
  userId: string;
  provider: GitConnectionProvider;
  kind: GitConnectionKind;
  displayName: string;
  externalAccountId: string | null;
  workExperienceId: string | null;
  disclosureLevelOverride: AgentDisclosureLevel | null;
  webhookSecret: string | null;
  autoPostEnabled: boolean;
  cadence: DigestCadence;
  includeAgentSummary: boolean;
  lastDigestAt: Date | null;

  constructor(props: GitConnectionEntityProps) {
    super(props);
    this.userId = props.userId;
    this.provider = props.provider;
    this.kind = props.kind;
    this.displayName = props.displayName;
    this.externalAccountId = props.externalAccountId ?? null;
    this.workExperienceId = props.workExperienceId ?? null;
    this.disclosureLevelOverride = props.disclosureLevelOverride ?? null;
    this.webhookSecret = props.webhookSecret ?? null;
    this.autoPostEnabled = props.autoPostEnabled;
    this.cadence = props.cadence;
    this.includeAgentSummary = props.includeAgentSummary;
    this.lastDigestAt = props.lastDigestAt ?? null;
  }

  /** True when this connection's activity belongs to an employer, not to the user personally. */
  isWork(): boolean {
    // `mixed` counts as work. Once personal and employer activity are
    // aggregated into one digest there is no way to show a given number came
    // from the personal half, so the employer's rules govern the whole thing.
    return this.kind === "work" || this.kind === "mixed";
  }

  /**
   * The `work_experiences` row this connection inherits its disclosure level
   * through, or null when it inherits straight from the account.
   *
   * A personal connection returns null even if a role id was somehow set: a
   * per-employer disclosure level has no meaning for work that is not an
   * employer's, and honouring it would apply an employer's redaction rules to
   * the user's own side projects.
   */
  resolvesDisclosureVia(): string | null {
    if (!this.isWork()) {
      return null;
    }

    return this.workExperienceId;
  }

  /**
   * Whether a digest is due as of `now`.
   *
   * Deliberately answers ONLY the cadence question. `autoPostEnabled` is a
   * separate switch — "may this connection publish at all" — checked by the
   * caller, so that a user who pauses auto-posting and resumes it later still
   * gets the schedule they configured rather than an immediate catch-up burst.
   *
   * A connection that has never produced a digest is due immediately: there is
   * no previous run to measure an interval from, and waiting a full cadence
   * before the first one would make a freshly connected source look broken.
   */
  isDueForDigest(now: Date = new Date()): boolean {
    if (this.cadence === "off") {
      return false;
    }

    if (this.lastDigestAt === null) {
      return true;
    }

    return now.getTime() >= this.nextDigestDueAt()!.getTime();
  }

  /**
   * When the next digest becomes due, or null when the cadence is `off` (never)
   * or nothing has been digested yet (immediately).
   */
  nextDigestDueAt(): Date | null {
    if (this.cadence === "off" || this.lastDigestAt === null) {
      return null;
    }

    const due = new Date(this.lastDigestAt.getTime());

    if (this.cadence === "monthly") {
      // Calendar month, not 30 days, and clamped to the last day of the target
      // month: a digest that ran on Jan 31 is next due Feb 28/29.
      //
      // The clamping is explicit because `setMonth` does NOT do it — it rolls
      // Feb 31 over into Mar 3, which would skip February entirely and drift
      // the due date later every short month.
      const dayOfMonth = due.getDate();
      // Park on the 1st first, so advancing the month cannot itself overflow.
      due.setDate(1);
      due.setMonth(due.getMonth() + 1);
      // Day 0 of the following month is the last day of this one.
      const lastDayOfTargetMonth = new Date(
        due.getFullYear(),
        due.getMonth() + 1,
        0,
      ).getDate();
      due.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
      return due;
    }

    due.setDate(due.getDate() + CADENCE_INTERVAL_DAYS[this.cadence]);
    return due;
  }

  /** Records that a digest ran, which is what starts the next cadence window. */
  markDigested(at: Date = new Date()) {
    this.lastDigestAt = at;
    this.updateTimestamp();
  }

  updateSettings(data: UpdateGitConnectionEntityProps) {
    if (data.displayName !== undefined) this.displayName = data.displayName;
    if (data.kind !== undefined) this.kind = data.kind;
    if (data.externalAccountId !== undefined)
      this.externalAccountId = data.externalAccountId ?? null;
    if (data.workExperienceId !== undefined)
      this.workExperienceId = data.workExperienceId ?? null;
    if (data.disclosureLevelOverride !== undefined)
      this.disclosureLevelOverride = data.disclosureLevelOverride ?? null;
    if (data.webhookSecret !== undefined)
      this.webhookSecret = data.webhookSecret ?? null;
    if (data.autoPostEnabled !== undefined)
      this.autoPostEnabled = data.autoPostEnabled;
    if (data.cadence !== undefined) this.cadence = data.cadence;
    if (data.includeAgentSummary !== undefined)
      this.includeAgentSummary = data.includeAgentSummary;
    if (data.lastDigestAt !== undefined)
      this.lastDigestAt = data.lastDigestAt ?? null;

    this.updateTimestamp();
  }

  /**
   * Read model. `webhookSecret` is omitted on purpose — it is a credential the
   * API verifies signatures with, and no read path needs it back after setup.
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      provider: this.provider,
      kind: this.kind,
      displayName: this.displayName,
      externalAccountId: this.externalAccountId,
      workExperienceId: this.workExperienceId,
      disclosureLevelOverride: this.disclosureLevelOverride,
      autoPostEnabled: this.autoPostEnabled,
      cadence: this.cadence,
      includeAgentSummary: this.includeAgentSummary,
      lastDigestAt: this.lastDigestAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
