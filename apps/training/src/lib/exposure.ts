import type { ResumeTrainingRow } from "./training-types.js";

/**
 * Position-bias correction.
 *
 * A candidate at rank 1 is seen by nearly every recruiter who runs the search; a
 * candidate at rank 40 is seen by almost nobody. Training on raw clicks
 * therefore teaches the model to reproduce the ranking that produced the clicks,
 * not the ranking a recruiter would prefer — the classic feedback loop where the
 * reranker slowly learns to agree with itself.
 *
 * The standard correction is inverse propensity scoring: weight each example by
 * 1/p, where p is the probability it was examined at all. With no propensity
 * model available, the usual approximation is a power law over rank,
 * `p_k = (1/k)^η`, with η around 0.8 for web-search-shaped result lists.
 */
export const POSITION_BIAS_ETA = 0.8;

/**
 * Floor on the propensity. Without it, rank 50 gets a weight of ~24 and a single
 * click at the bottom of the page outvotes twenty clicks at the top — the
 * variance blowup IPS is famous for.
 */
export const MIN_PROPENSITY = 0.1;

/** `p_k = (1/k)^η`, clamped. */
export function rankPropensity(
  displayedRank: number,
  eta: number = POSITION_BIAS_ETA,
): number {
  if (!Number.isFinite(displayedRank) || displayedRank < 1) {
    return 1;
  }

  return Math.pow(1 / displayedRank, eta);
}

/**
 * IPS weight for one training row.
 *
 * A logged `propensity` wins when present — it is what the ranker actually
 * believed at serve time. Otherwise the rank-based approximation is used. Rows
 * with no exposure information at all (everything written before the columns
 * existed) fall back to 1, which is the honest "we don't know".
 */
export function inversePropensityWeight(row: {
  displayedRank?: number | null;
  propensity?: number | null;
}): number {
  const logged = row.propensity;
  if (logged != null && Number.isFinite(logged) && logged > 0) {
    return 1 / Math.max(logged, MIN_PROPENSITY);
  }

  if (row.displayedRank == null) {
    return 1;
  }

  return 1 / Math.max(rankPropensity(row.displayedRank), MIN_PROPENSITY);
}

/** Hard ceiling on replication, so one deep-ranked row cannot dominate a batch. */
export const MAX_IMPORTANCE_COPIES = 10;

/**
 * Applies IPS weights by replicating rows.
 *
 * `tf.LayersModel.fit` does not implement `sampleWeight` ("sample weight is not
 * supported yet"), so the weight has to be expressed in the data itself. This is
 * systematic resampling: the fractional part of each weight is carried forward
 * rather than rounded away, so across the dataset the number of copies matches
 * the total weight exactly instead of drifting. Deterministic — no RNG, so two
 * runs over the same rows produce byte-identical training sets.
 *
 * A row weighted 1 (everything synthetic, and everything with no exposure data)
 * appears exactly once, so a dataset with no exposure logging is untouched.
 */
export function expandByImportanceWeight<T>(
  rows: readonly T[],
  weightOf: (row: T) => number,
): T[] {
  const expanded: T[] = [];
  let carry = 0;

  for (const row of rows) {
    const weight = Math.min(MAX_IMPORTANCE_COPIES, Math.max(0, weightOf(row)));
    const budget = weight + carry;
    const copies = Math.floor(budget);
    carry = budget - copies;

    for (let index = 0; index < copies; index += 1) {
      expanded.push(row);
    }
  }

  return expanded;
}

/**
 * Interaction score at which a recruiter counts as having *chosen* a candidate
 * rather than merely looked at one. Matches the weight of `EMAIL_COPY` /
 * `CONTACT_CLICK`; a `PROFILE_VIEW` (0.35) sits below it.
 */
export const SKIP_ABOVE_ENGAGEMENT_THRESHOLD = 1;

/**
 * Derives "examined and rejected" negatives from what a session shows.
 *
 * Within one search session, a candidate ranked ABOVE one the recruiter acted on
 * was necessarily scrolled past — the recruiter's eyes reached the click, so
 * they reached everything above it. That makes it a real negative, and unlike
 * "not clicked" it needs no propensity model at all. It is the cheapest correct
 * negative signal there is.
 *
 * Limitation worth stating plainly: there is no impressions log, so the only
 * candidates we can *name* at a given rank are the ones that produced some
 * interaction. This therefore recovers skip-above negatives for candidates the
 * recruiter viewed (or marked not-relevant) but did not act on — not for the
 * silent majority. Emitting `PROFILE_VIEW` from the results UI is what makes
 * this worth anything.
 */
function groupBySearchSession(
  rows: readonly ResumeTrainingRow[],
): Map<string, ResumeTrainingRow[]> {
  const bySession = new Map<string, ResumeTrainingRow[]>();

  for (const row of rows) {
    if (!row.searchSessionId || row.displayedRank == null) {
      continue;
    }
    const bucket = bySession.get(row.searchSessionId);
    if (bucket) {
      bucket.push(row);
    } else {
      bySession.set(row.searchSessionId, [row]);
    }
  }

  return bySession;
}

/**
 * Deepest rank the recruiter *chose* something at, within one session.
 * Everything above it was on screen on the way down.
 *
 * "Chose" means a strong signal (an email copy, a contact reveal), not a
 * profile view. A view is the evidence that a candidate was EXAMINED, which
 * is exactly what makes them eligible to be a skip-above negative — treating
 * it as engagement would exclude the only rows this can recover.
 */
function deepestEngagedRankIn(
  sessionRows: readonly ResumeTrainingRow[],
): number {
  let deepestEngagedRank = 0;
  for (const row of sessionRows) {
    if (
      row.interactionScore >= SKIP_ABOVE_ENGAGEMENT_THRESHOLD &&
      row.displayedRank! > deepestEngagedRank
    ) {
      deepestEngagedRank = row.displayedRank!;
    }
  }
  return deepestEngagedRank;
}

function skipAboveNegativesForSession(
  sessionRows: readonly ResumeTrainingRow[],
  deepestEngagedRank: number,
): ResumeTrainingRow[] {
  const negatives: ResumeTrainingRow[] = [];

  for (const row of sessionRows) {
    if (
      row.interactionScore >= SKIP_ABOVE_ENGAGEMENT_THRESHOLD ||
      row.displayedRank! >= deepestEngagedRank
    ) {
      continue;
    }

    negatives.push({
      ...row,
      resumeId: `${row.resumeId}#skip-above`,
      // Explicit, because the row's own weak positive (a PROFILE_VIEW is
      // worth 0.35) is exactly the signal being overruled: the recruiter
      // looked, then chose someone below.
      forcedLabel: 0,
    });
  }

  return negatives;
}

export function deriveSkipAboveNegatives(
  rows: readonly ResumeTrainingRow[],
): ResumeTrainingRow[] {
  const bySession = groupBySearchSession(rows);
  const negatives: ResumeTrainingRow[] = [];

  for (const sessionRows of bySession.values()) {
    const deepestEngagedRank = deepestEngagedRankIn(sessionRows);
    if (deepestEngagedRank === 0) {
      continue;
    }

    negatives.push(
      ...skipAboveNegativesForSession(sessionRows, deepestEngagedRank),
    );
  }

  return negatives;
}
