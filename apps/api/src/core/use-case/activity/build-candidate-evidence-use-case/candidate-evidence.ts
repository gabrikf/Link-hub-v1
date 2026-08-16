import type { ActivityEventKind, ActivitySource } from "@repo/schemas";
import type { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import {
  countMonthsInWindow,
  countWeeksInWindow,
} from "../shared/activity-buckets.js";

/**
 * Deterministic derivation of hiring evidence from the activity log.
 *
 * ============================================================================
 * WHY THESE SIX CLAIMS AND NOT THE OBVIOUS ONES
 * ============================================================================
 *
 * Read this before adding a claim, and especially before "improving" one of
 * these back into the metric it deliberately replaced. Every shape below was
 * chosen because it is HARD TO FABRICATE and CORRELATES WITH HIRING OUTCOMES.
 * The metrics a developer-activity product usually ships — commit count, lines
 * changed, streaks, "using X since 2019" — fail one or both tests, and shipping
 * them would cost the product the only thing it actually sells: a recruiter's
 * belief that the numbers mean something.
 *
 * 1. THIRD-PARTY WARRANTED WORK — merged changes, reported WITH the count of
 *    distinct people who approved them. The merge count alone is inflatable by
 *    anyone who can approve their own pull requests. The DISTINCT-APPROVER
 *    count is not: it requires other humans, with their own accounts, to have
 *    looked. Reporting the pair is what turns "23 merges" from a self-assertion
 *    into a warranted one, so the two numbers must always travel together.
 *
 * 2. REVIEW GIVEN TO OTHERS — reviews the user submitted on other people's
 *    work. Structurally impossible to self-issue (`actorIsOwner === false` is
 *    the definition), and it captures mentoring and review load, which commit
 *    counts miss entirely and which is most of what a senior engineer actually
 *    does.
 *
 * 3. MONTH DENSITY PER TECHNOLOGY — "active in TypeScript in 43 of the last 48
 *    months", NOT "TypeScript since 2019". First-touch tenure is close to a
 *    null predictor of ability, and it is trivially inflated: one tutorial
 *    commit in 2019 buys "7 years of TypeScript" forever. Density is a
 *    fraction, so silence counts against it, and it cannot be bought with a
 *    single commit.
 *
 * 4. RECENCY / CONSISTENCY — "active in 11 of the last 13 weeks". NEVER a
 *    streak. A streak is fabricable by one commit a day, and — the part that
 *    matters more — publishing streaks manufactures pressure to never take a
 *    week off. A fraction says the same thing about consistency without
 *    rewarding a person for working while ill.
 *
 * 5. SUSTAINED ENGAGEMENT — distinct active months against a SINGLE codebase.
 *    Depth on one system is the evidenced signal: it is where a person meets
 *    legacy code, migrations, and the consequences of their own decisions.
 *    Breadth across many repositories is not a signal; it is often the opposite.
 *
 * 6. RELEASE PARTICIPATION — events of kind `release`. Shipping is the outcome
 *    the rest of the work exists for, and a release is witnessed by whoever
 *    consumed it.
 *
 * COMMIT COUNT IS COMPUTED AND MUST NOT BE A HEADLINE. It is on the evidence
 * object as `internalCommitCount` for sanity checks and for the "why did I get
 * this number" panel, and the renderer must never promote it. Two reasons, both
 * fatal on their own: `GIT_AUTHOR_DATE` is a client-side environment variable,
 * so an entire commit history — dates included — is forgeable with a shell
 * loop; and GitClear's own dataset puts the correlation between commit count
 * and delivered effort at roughly 27%. Rendering a number that is both
 * fabricable and weakly predictive as the headline would undercut the five
 * claims above that are neither.
 *
 * NOTHING IS DERIVED FROM HOUR-OF-DAY OR TIMEZONE, because the data does not
 * contain them: `occurred_on` is a DATE by design. And nothing here can surface
 * a repository name or a third party's identity, because only fingerprints are
 * stored and NO fingerprint is copied onto a claim — the claims carry counts,
 * never identifiers. There is a test asserting exactly that.
 */

export interface EvidenceWindow {
  /** Inclusive `YYYY-MM-DD` lower bound. */
  from: string;
  /** Inclusive `YYYY-MM-DD` upper bound. */
  to: string;
}

/**
 * Why a claim says what it says.
 *
 * Every claim carries one of these so the UI can answer "where did this number
 * come from" without re-deriving anything: which delivery mechanisms fed it,
 * which event kinds were counted, over which window, and how many events are
 * behind it. A claim without provenance is an assertion, which is the thing
 * this product exists not to publish.
 */
export interface ClaimProvenance {
  /** The exact window the claim was computed over. */
  window: EvidenceWindow;
  /** Distinct ingestion sources behind the counted events, sorted. */
  sources: ActivitySource[];
  /** Distinct event kinds counted, sorted. */
  kinds: ActivityEventKind[];
  /** How many activity events this specific claim aggregates. */
  eventCount: number;
}

export interface ThirdPartyWarrantedWorkClaim {
  kind: "third_party_warranted_work";
  /** Merged changes the user authored. */
  mergedChangeCount: number;
  /**
   * Distinct people who approved them, de-duplicated ACROSS events: one
   * reviewer who approved nine pull requests is one distinct approver, not
   * nine. Counting per-event and summing is the classic way this number gets
   * silently inflated back into a vanity metric.
   */
  distinctApproverCount: number;
  provenance: ClaimProvenance;
}

export interface ReviewGivenClaim {
  kind: "review_given";
  reviewCount: number;
  /** Distinct authors whose work the user reviewed, de-duplicated across events. */
  distinctAuthorCount: number;
  provenance: ClaimProvenance;
}

export interface TechnologyMonthDensityClaim {
  kind: "technology_month_density";
  technology: string;
  /** Distinct MONTHS carrying this technology — not events, not commits. */
  activeMonths: number;
  /** Months the window covers, i.e. the denominator. */
  windowMonths: number;
  provenance: ClaimProvenance;
}

export interface RecencyConsistencyClaim {
  kind: "recency_consistency";
  activeWeeks: number;
  windowWeeks: number;
  provenance: ClaimProvenance;
}

export interface SustainedEngagementClaim {
  kind: "sustained_engagement";
  /** Distinct active months on the single codebase with the deepest history. */
  activeMonthsOnDeepestCodebase: number;
  /**
   * How many distinct codebases the window covers. A COUNT, never a list: the
   * fingerprints stay in the repository layer so a claim object cannot become a
   * vector for leaking which repositories a person works on.
   */
  codebaseCount: number;
  provenance: ClaimProvenance;
}

export interface ReleaseParticipationClaim {
  kind: "release_participation";
  releaseCount: number;
  /** Distinct months containing a release, so a single burst is visible as one. */
  activeMonths: number;
  provenance: ClaimProvenance;
}

export type EvidenceClaim =
  | ThirdPartyWarrantedWorkClaim
  | ReviewGivenClaim
  | TechnologyMonthDensityClaim
  | RecencyConsistencyClaim
  | SustainedEngagementClaim
  | ReleaseParticipationClaim;

export interface CandidateEvidence {
  window: EvidenceWindow;
  windowMonths: number;
  windowWeeks: number;
  /** Every event in the window, whether or not it fed a claim. */
  totalEventCount: number;
  /**
   * Computed, never rendered as a headline. See the file header for why. Kept
   * so the provenance panel can show the raw volume behind a digest and so a
   * future analysis has the number without recomputing it.
   */
  internalCommitCount: number;
  /** Distinct technology tags seen in the window, sorted. */
  technologies: string[];
  /** Every emitted claim, flattened, for a UI that renders them generically. */
  claims: EvidenceClaim[];
  thirdPartyWarrantedWork: ThirdPartyWarrantedWorkClaim | null;
  reviewGiven: ReviewGivenClaim | null;
  technologyMonthDensity: TechnologyMonthDensityClaim[];
  recency: RecencyConsistencyClaim | null;
  sustainedEngagement: SustainedEngagementClaim | null;
  releaseParticipation: ReleaseParticipationClaim | null;
}

/**
 * How many technologies may produce a density claim.
 *
 * A developer's activity log accumulates dozens of tags; listing all of them
 * turns the strongest claim in the set into a wall of noise, and a reader who
 * skims stops at three.
 */
const MAX_TECHNOLOGY_CLAIMS = 6;

/**
 * A single month on a codebase is not "sustained" by any reading of the word,
 * so the claim is withheld below this rather than emitted as "1 active month".
 */
const MIN_SUSTAINED_MONTHS = 2;

export function deriveCandidateEvidence(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): CandidateEvidence {
  const windowMonths = countMonthsInWindow(window.from, window.to);
  const windowWeeks = countWeeksInWindow(window.from, window.to);

  const thirdPartyWarrantedWork = deriveThirdPartyWarrantedWork(events, window);
  const reviewGiven = deriveReviewGiven(events, window);
  const technologyMonthDensity = deriveTechnologyMonthDensity(
    events,
    window,
    windowMonths,
  );
  const recency = deriveRecency(events, window, windowWeeks);
  const sustainedEngagement = deriveSustainedEngagement(events, window);
  const releaseParticipation = deriveReleaseParticipation(events, window);

  const claims: EvidenceClaim[] = [
    thirdPartyWarrantedWork,
    reviewGiven,
    ...technologyMonthDensity,
    recency,
    sustainedEngagement,
    releaseParticipation,
  ].filter((claim): claim is EvidenceClaim => claim !== null);

  return {
    window,
    windowMonths,
    windowWeeks,
    totalEventCount: events.length,
    internalCommitCount: events.filter((event) => event.kind === "commit").length,
    technologies: distinctSorted(events.flatMap((event) => event.technologies)),
    claims,
    thirdPartyWarrantedWork,
    reviewGiven,
    technologyMonthDensity,
    recency,
    sustainedEngagement,
    releaseParticipation,
  };
}

/**
 * Whether this evidence is worth publishing a post about.
 *
 * The bar is deliberately one of the three WARRANTED claims — merged work,
 * review given, or a release. A week of nothing but commits does not clear it,
 * and that follows directly from the rule that commit count may not be a
 * headline: if the only evidence available is the fabricable kind, there is no
 * honest post to write, and a silent week is a perfectly good outcome. Posting
 * "1 active week, TypeScript" would be the vanity update this engine exists to
 * avoid.
 */
export function hasPublishableEvidence(evidence: CandidateEvidence): boolean {
  return (
    evidence.thirdPartyWarrantedWork !== null ||
    evidence.reviewGiven !== null ||
    evidence.releaseParticipation !== null
  );
}

function deriveThirdPartyWarrantedWork(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): ThirdPartyWarrantedWorkClaim | null {
  // `actorIsOwner` is the discriminator: a merged pull request the user did not
  // author is somebody else's evidence, however it arrived in their log.
  const merged = events.filter(
    (event) => event.kind === "pull_request_merged" && event.actorIsOwner,
  );

  if (merged.length === 0) return null;

  return {
    kind: "third_party_warranted_work",
    mergedChangeCount: merged.length,
    // One Set across every event, which is what makes "9 distinct reviewers"
    // mean nine people rather than nine approvals.
    distinctApproverCount: distinctCounterparties(merged).size,
    provenance: buildProvenance(merged, window),
  };
}

function deriveReviewGiven(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): ReviewGivenClaim | null {
  // `review_submitted` + NOT owner: a review the user gave on work that was not
  // theirs. `review_received` is the mirror image and is deliberately not a
  // claim — being reviewed is not an achievement.
  const given = events.filter(
    (event) => event.kind === "review_submitted" && !event.actorIsOwner,
  );

  if (given.length === 0) return null;

  return {
    kind: "review_given",
    reviewCount: given.length,
    distinctAuthorCount: distinctCounterparties(given).size,
    provenance: buildProvenance(given, window),
  };
}

function deriveTechnologyMonthDensity(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
  windowMonths: number,
): TechnologyMonthDensityClaim[] {
  const monthsByTechnology = new Map<string, Set<string>>();
  const eventsByTechnology = new Map<string, ActivityEventEntity[]>();

  for (const event of events) {
    // A tag repeated on the same event, or on ten events in one month, adds one
    // month at most. Months are the unit; events are not.
    for (const technology of new Set(event.technologies)) {
      const months = monthsByTechnology.get(technology) ?? new Set<string>();
      months.add(event.monthBucket());
      monthsByTechnology.set(technology, months);

      const bucket = eventsByTechnology.get(technology) ?? [];
      bucket.push(event);
      eventsByTechnology.set(technology, bucket);
    }
  }

  return [...monthsByTechnology.entries()]
    .map(([technology, months]) => ({
      kind: "technology_month_density" as const,
      technology,
      activeMonths: months.size,
      windowMonths,
      provenance: buildProvenance(eventsByTechnology.get(technology) ?? [], window),
    }))
    // Densest first, then alphabetical — a total order, so the same log always
    // renders the same post.
    .sort(
      (a, b) =>
        b.activeMonths - a.activeMonths ||
        a.technology.localeCompare(b.technology),
    )
    .slice(0, MAX_TECHNOLOGY_CLAIMS);
}

function deriveRecency(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
  windowWeeks: number,
): RecencyConsistencyClaim | null {
  if (events.length === 0) return null;

  const activeWeeks = new Set(events.map((event) => event.weekBucket()));

  return {
    kind: "recency_consistency",
    activeWeeks: activeWeeks.size,
    windowWeeks,
    provenance: buildProvenance(events, window),
  };
}

function deriveSustainedEngagement(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): SustainedEngagementClaim | null {
  const monthsByRepo = new Map<string, Set<string>>();

  for (const event of events) {
    const months = monthsByRepo.get(event.repoFingerprint) ?? new Set<string>();
    months.add(event.monthBucket());
    monthsByRepo.set(event.repoFingerprint, months);
  }

  if (monthsByRepo.size === 0) return null;

  const deepest = Math.max(
    ...[...monthsByRepo.values()].map((months) => months.size),
  );

  if (deepest < MIN_SUSTAINED_MONTHS) return null;

  return {
    kind: "sustained_engagement",
    activeMonthsOnDeepestCodebase: deepest,
    codebaseCount: monthsByRepo.size,
    provenance: buildProvenance(events, window),
  };
}

function deriveReleaseParticipation(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): ReleaseParticipationClaim | null {
  const releases = events.filter((event) => event.kind === "release");

  if (releases.length === 0) return null;

  return {
    kind: "release_participation",
    releaseCount: releases.length,
    activeMonths: new Set(releases.map((event) => event.monthBucket())).size,
    // NOTE ON THE DENOMINATOR. The canonical phrasing of this claim is
    // "contributed to 34 of the last 52 releases", but the ingestion log only
    // ever sees releases the user took part in — a release they were absent
    // from produces no event, so the total is not derivable from this data.
    // Inventing a denominator would be exactly the kind of fabricated precision
    // the rest of this file refuses, so the claim reports what is known: how
    // many releases, spread over how many months.
    provenance: buildProvenance(releases, window),
  };
}

/** One Set across every supplied event — see `ThirdPartyWarrantedWorkClaim`. */
function distinctCounterparties(
  events: readonly ActivityEventEntity[],
): Set<string> {
  const fingerprints = new Set<string>();

  for (const event of events) {
    for (const fingerprint of event.counterpartyFingerprints) {
      fingerprints.add(fingerprint);
    }
  }

  return fingerprints;
}

/**
 * Builds the "why did I get this number" record for a claim.
 *
 * Note what it takes from the events: counts, sources and kinds. Never a
 * fingerprint, never a payload. Provenance has to be safe to render on a public
 * profile, so it can only ever contain things that were already safe.
 */
function buildProvenance(
  events: readonly ActivityEventEntity[],
  window: EvidenceWindow,
): ClaimProvenance {
  return {
    window,
    sources: distinctSorted(events.map((event) => event.source)) as ActivitySource[],
    kinds: distinctSorted(events.map((event) => event.kind)) as ActivityEventKind[],
    eventCount: events.length,
  };
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
