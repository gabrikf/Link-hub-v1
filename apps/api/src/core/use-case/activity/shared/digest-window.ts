import type { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import type { EvidenceWindow } from "../build-candidate-evidence-use-case/candidate-evidence.js";
import {
  addDays,
  addMonths,
  startOfIsoWeek,
  startOfMonth,
  toDateString,
} from "./activity-buckets.js";

/**
 * How far back the "track record" claims look.
 *
 * Month density and sustained engagement are tenure-shaped claims — "43 of the
 * last 48 months" — and computing them over a seven-day digest window would
 * produce the useless "1 of the last 1 months". So a digest builds evidence over
 * THREE windows, and each claim carries the one it was computed over in its
 * provenance. Four years is long enough to show a career arc and short enough
 * that a technology someone abandoned in 2020 stops being claimed.
 */
export const TRACK_RECORD_MONTHS = 48;

/**
 * How far back the recency claim looks: one quarter, in whole ISO weeks.
 *
 * "Active in 11 of the last 13 weeks" needs a horizon short enough that the
 * fraction still says something about now. Measured over the four-year track
 * record it degenerates into "40 of the last 209 weeks", which is a tenure
 * claim wearing recency's clothes.
 */
export const RECENT_WINDOW_WEEKS = 13;

/**
 * Longest window a single digest will cover.
 *
 * A connection that was paused for a year and then re-enabled would otherwise
 * produce a "weekly" digest summarising twelve months, which is not a period
 * update — it is a backfill wearing one's clothes, and it would post a wildly
 * inflated set of numbers under a weekly headline. Capping at a quarter means
 * the first digest after a long silence covers a recent, honest slice.
 */
export const MAX_DIGEST_WINDOW_DAYS = 92;

/**
 * The window a digest covers, given when the connection was last digested.
 *
 * Two rules, both deliberate:
 *
 * - WINDOWS NEVER OVERLAP. The window opens the day AFTER `lastDigestAt`, so no
 *   event is ever counted in two posts. The cost is that an event ingested late
 *   for a day already digested is missed; the alternative is a profile where
 *   "23 merged changes" and "19 merged changes" describe overlapping sets and
 *   neither post is independently true. Non-overlapping wins: each post has to
 *   stand on its own in front of a recruiter.
 *
 * - THE FIRST WINDOW IS ONE CADENCE LONG. A never-digested connection has no
 *   previous run to measure from, and `isDueForDigest` treats it as due
 *   immediately, so the window is the cadence period ending today.
 */
export function resolveDigestWindow(
  connection: GitConnectionEntity,
  now: Date,
): EvidenceWindow {
  const to = toDateString(now);
  const earliestAllowed = addDays(to, -(MAX_DIGEST_WINDOW_DAYS - 1));

  const from =
    connection.lastDigestAt === null
      ? firstWindowStart(connection, to)
      : addDays(toDateString(connection.lastDigestAt), 1);

  return { from: from < earliestAllowed ? earliestAllowed : from, to };
}

/**
 * The tenure lookback that ends where the digest window ends.
 *
 * Aligned to the first day of a month so the window covers exactly 48 WHOLE
 * calendar months. A window that started mid-month would touch 49 of them — a
 * partial one at each end — and the claim would read "43 of the last 49 months"
 * while meaning four years.
 */
export function resolveTrackRecordWindow(window: EvidenceWindow): EvidenceWindow {
  return {
    from: startOfMonth(addMonths(window.to, -(TRACK_RECORD_MONTHS - 1))),
    to: window.to,
  };
}

/**
 * The recency horizon, aligned to a Monday so it covers exactly 13 ISO weeks.
 *
 * Without the alignment a 13 * 7 day window starting mid-week touches fourteen
 * ISO weeks, and the denominator of the consistency claim would silently be one
 * larger than the number it is named after.
 */
export function resolveRecentWindow(window: EvidenceWindow): EvidenceWindow {
  return {
    from: addDays(startOfIsoWeek(window.to), -(RECENT_WINDOW_WEEKS - 1) * 7),
    to: window.to,
  };
}

/**
 * The idempotency key for one digest.
 *
 * Stored on the post's `metadata` and looked up before writing, which is what
 * makes running the same digest twice produce one post. It is keyed on the
 * connection AND the exact window, not on the connection alone: two different
 * weeks are two legitimate posts, and the same week is one, whatever retried it.
 *
 * `off` cadences and disabled connections never reach here, so the key carries
 * no cadence — a window that was generated weekly and re-run manually is still
 * the same digest and must still collapse.
 */
export function buildDigestKey(
  connectionId: string,
  window: EvidenceWindow,
): string {
  return `digest:${connectionId}:${window.from}:${window.to}`;
}

/**
 * The window a digest preview covers: one trailing cadence period ending today.
 *
 * Deliberately NOT `resolveDigestWindow`. A preview answers "what would a post
 * about my recent work look like", so it must show a typical period even when
 * the real next window would be a two-day stub (freshly digested) or a
 * quarter-long backfill (long-paused connection). `off` falls back to a weekly
 * window for the same reason: the user previewing a muted connection is
 * deciding whether to unmute it, and weekly is the default they would get.
 */
export function resolveDigestPreviewWindow(
  connection: GitConnectionEntity,
  now: Date,
): EvidenceWindow {
  const to = toDateString(now);
  const cadence = connection.cadence === "off" ? "weekly" : connection.cadence;

  return { from: trailingWindowStart(cadence, to), to };
}

function firstWindowStart(
  connection: GitConnectionEntity,
  to: string,
): string {
  if (connection.cadence === "off") {
    // Unreachable through the sweep — `isDueForDigest` returns false for
    // `off` — but a direct caller gets a single day rather than a throw.
    return to;
  }

  return trailingWindowStart(connection.cadence, to);
}

/** First day of the window one cadence period long that ends on `to`, inclusive. */
function trailingWindowStart(
  cadence: Exclude<GitConnectionEntity["cadence"], "off">,
  to: string,
): string {
  switch (cadence) {
    case "weekly":
      // Seven inclusive days ending today.
      return addDays(to, -6);
    case "biweekly":
      return addDays(to, -13);
    case "monthly":
      return addDays(addMonths(to, -1), 1);
  }
}
