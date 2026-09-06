/**
 * Pure calendar bucketing for activity aggregation.
 *
 * Everything here operates on `YYYY-MM-DD` strings — the same DATE granularity
 * `activity_events.occurred_on` stores — and never on a timestamp. That is not a
 * convenience: the ingestion schema deliberately refuses hour-of-day and
 * timezone offsets so the product cannot publish when a user sleeps, and an
 * aggregation layer that reached for `Date.now()` or a local-time `getDate()`
 * would quietly reintroduce a timezone into numbers that are supposed to be
 * reproducible anywhere.
 *
 * Consequences of that rule, which are load-bearing rather than stylistic:
 * - every `Date` is read through UTC accessors;
 * - the only arithmetic is on whole days and whole months;
 * - the same event produces the same bucket on a laptop in Sao Paulo and a
 *   worker in eu-central-1, so a digest is byte-identical wherever it runs.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Hard stop on day-by-day enumeration.
 *
 * Windows are supposed to be bounded (a cadence period, or the track-record
 * lookback). A caller that passes a nonsense range should get a wrong-but-finite
 * answer rather than hang a worker, so the loops below refuse to run longer than
 * roughly a human career.
 */
const MAX_ENUMERATED_DAYS = 40_000;

/** `YYYY-MM`, the aggregation bucket the DATE column exists to support. */
export function monthBucket(date: string): string {
  return date.slice(0, 7);
}

/**
 * Splits a `YYYY-MM-DD` into its three numbers.
 *
 * `date.split("-").map(Number)` destructures to `number | undefined` under
 * `noUncheckedIndexedAccess`, and a string with fewer than three parts really
 * does produce one. Every caller below feeds the parts straight to `Date.UTC`,
 * where `undefined` and `NaN` are the same thing — an Invalid Date — so
 * defaulting to `NaN` keeps today's behaviour and drops the lie in the type.
 */
function splitDateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);

  return [year ?? Number.NaN, month ?? Number.NaN, day ?? Number.NaN];
}

/**
 * The ISO-8601 week a date falls in, as `YYYY-Www`.
 *
 * Deliberately a standalone copy of `ActivityEventEntity.weekBucket()` rather
 * than a call into the entity: this has to bucket window BOUNDARIES (dates with
 * no event behind them), and manufacturing a throwaway entity to ask a date
 * question would be worse. The duplication is pinned by a test that asserts the
 * two agree across year boundaries, so they cannot drift apart unnoticed.
 *
 * ISO weeks start on Monday and the week-numbering year can differ from the
 * calendar year around New Year, which is why the year is taken from the
 * Thursday of the week rather than from the date itself.
 */
export function isoWeekBucket(date: string): string {
  const [year, month, day] = splitDateParts(date);
  const target = new Date(Date.UTC(year, month - 1, day));

  // Shift to the Thursday of this ISO week (Sunday counts as day 7).
  const isoDayOfWeek = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - isoDayOfWeek);

  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstIsoDayOfWeek =
    firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstIsoDayOfWeek);

  const week =
    1 +
    Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** The UTC calendar day of an instant, as `YYYY-MM-DD`. */
export function toDateString(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Midnight UTC on a `YYYY-MM-DD`, for the rare place that needs a real instant. */
export function toUtcDate(date: string): Date {
  const [year, month, day] = splitDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Whole-day arithmetic on a `YYYY-MM-DD`. Negative `days` moves backwards. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(toUtcDate(date).getTime() + days * MS_PER_DAY);
  return toDateString(shifted);
}

/**
 * Whole-CALENDAR-month arithmetic, clamped to the last day of the target month.
 *
 * Mirrors `GitConnectionEntity.nextDigestDueAt()`: `setMonth` rolls Feb 31 over
 * into March instead of clamping, which would make "one month back from Mar 31"
 * land in March. Parking on the 1st before moving the month is what stops the
 * overflow.
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = splitDateParts(date);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  cursor.setUTCMonth(cursor.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
  ).getUTCDate();

  cursor.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return toDateString(cursor);
}

/** Inclusive day count of a window, or 0 when the range is inverted. */
export function countDaysInWindow(from: string, to: string): number {
  if (from > to) return 0;

  const days =
    Math.round(
      (toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY,
    ) + 1;

  return Math.min(days, MAX_ENUMERATED_DAYS);
}

/**
 * How many distinct calendar months the window touches, inclusive on both ends.
 *
 * This is the DENOMINATOR of the month-density claim ("43 of the last 48
 * months"), so it counts months the window covers, not months with activity —
 * a month the user was silent still counts against them, which is the entire
 * point of expressing density as a fraction.
 */
export function countMonthsInWindow(from: string, to: string): number {
  if (from > to) return 0;

  const [fromYear, fromMonth] = splitDateParts(from);
  const [toYear, toMonth] = splitDateParts(to);

  return toYear * 12 + toMonth - (fromYear * 12 + fromMonth) + 1;
}

/**
 * How many distinct ISO weeks the window touches, inclusive on both ends.
 *
 * Enumerated day by day rather than divided by seven: a window rarely starts on
 * a Monday, so `ceil(days / 7)` is off by one about six days out of seven, and
 * an off-by-one in the denominator of "active in 11 of the last 13 weeks" is a
 * claim that is quietly wrong.
 */
export function countWeeksInWindow(from: string, to: string): number {
  return enumerateWeeks(from, to).length;
}

/**
 * The Monday of the ISO week a date falls in.
 *
 * Used to align a "last N weeks" window to a week boundary. Without it a window
 * of `N * 7` days starting on a Wednesday touches N+1 ISO weeks, and "active in
 * 11 of the last 13 weeks" quietly becomes "of the last 14".
 */
export function startOfIsoWeek(date: string): string {
  const parsed = toUtcDate(date);
  const isoDayOfWeek = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();

  return addDays(date, -(isoDayOfWeek - 1));
}

/** The first day of the month a date falls in. */
export function startOfMonth(date: string): string {
  return `${monthBucket(date)}-01`;
}

/** Every ISO week the window touches, in chronological order. */
export function enumerateWeeks(from: string, to: string): string[] {
  if (from > to) return [];

  const weeks: string[] = [];
  const seen = new Set<string>();
  let cursor = from;

  for (let guard = 0; guard < MAX_ENUMERATED_DAYS && cursor <= to; guard += 1) {
    const bucket = isoWeekBucket(cursor);

    if (!seen.has(bucket)) {
      seen.add(bucket);
      weeks.push(bucket);
    }

    cursor = addDays(cursor, 1);
  }

  return weeks;
}

/** Every `YYYY-MM` the window touches, in chronological order. */
export function enumerateMonths(from: string, to: string): string[] {
  if (from > to) return [];

  const months: string[] = [];
  let cursor = `${monthBucket(from)}-01`;
  const last = monthBucket(to);

  for (
    let guard = 0;
    guard < MAX_ENUMERATED_DAYS && monthBucket(cursor) <= last;
    guard += 1
  ) {
    months.push(monthBucket(cursor));
    cursor = addMonths(cursor, 1);
  }

  return months;
}
