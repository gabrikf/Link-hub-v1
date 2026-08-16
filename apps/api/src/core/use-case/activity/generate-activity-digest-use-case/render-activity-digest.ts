import { findDisclosureViolations } from "../../agent-policy/redact-work-disclosure.js";
import type { CandidateEvidence } from "../build-candidate-evidence-use-case/candidate-evidence.js";

/**
 * The deterministic digest template.
 *
 * NO LLM. Same evidence in, byte-identical post out, forever. That is the whole
 * proposition: a reader can be told these numbers were not written by a model
 * that might have rounded up, and a support engineer can reproduce any published
 * post from the event log.
 *
 * The shape follows the house style in `apps/mcp/src/resources/post-guidelines.ts`
 * — first person, past tense, outcome-first, an optional intro line, two to five
 * `-` bullets, a closing line naming the stack, no headings, no exclamation
 * marks, no filler, well under 200 words. It also honours the guide's hardest
 * rule for free: there are no commit messages, SHAs, branch names, ticket ids or
 * file paths anywhere, because none of those are in the data to begin with.
 */

/** The guide's ceiling: a title over this is truncated by every surface that shows it. */
const MAX_TITLE_LENGTH = 70;

/** The guide's "2–5 bullets". Five is the ceiling, not the target. */
const MAX_BULLETS = 5;

/** Recruiters skim; three named technologies is a stack, ten is noise. */
const MAX_STACK_TAGS = 5;

export interface RenderActivityDigestInput {
  /** Evidence over the cadence window: what happened this period. */
  period: CandidateEvidence;
  /** Evidence over the last 13 ISO weeks: whether the period was typical. */
  recent: CandidateEvidence;
  /** Evidence over the 48-month lookback: what this period sits inside. */
  trackRecord: CandidateEvidence;
  /**
   * The effective denylist for this connection. The template's only variable
   * text is technology tags, which arrive from an outside hook and could in
   * principle carry an employer's name (`acme-sdk` tagged as `Acme`), so tags
   * are filtered through this before rendering. The disclosure assertion the
   * caller runs afterwards is the backstop, not the mechanism.
   */
  blockedTerms: readonly string[];
}

export interface RenderedActivityDigest {
  title: string;
  body: string;
  tags: string[] | null;
}

export function renderActivityDigest(
  input: RenderActivityDigestInput,
): RenderedActivityDigest {
  const stack = filterBlockedTerms(
    input.period.technologies,
    input.blockedTerms,
  ).slice(0, MAX_STACK_TAGS);

  return {
    title: buildTitle(input.period),
    body: buildBody(input, stack),
    tags: stack.length > 0 ? stack.map((tag) => tag.toLowerCase()) : null,
  };
}

/**
 * The headline is the strongest WARRANTED claim available, in a fixed order of
 * preference. "Weekly update" is explicitly called out as weak in the house
 * guide, and a title built from a number a third party vouched for is the
 * opposite of that.
 *
 * Note that a commit count never reaches this function — see the claim rationale
 * in `candidate-evidence.ts`.
 */
function buildTitle(period: CandidateEvidence): string {
  const merged = period.thirdPartyWarrantedWork;

  if (merged) {
    const changes = `${merged.mergedChangeCount} ${plural(merged.mergedChangeCount, "change")}`;
    const title =
      merged.distinctApproverCount > 0
        ? `Merged ${changes}, approved by ${merged.distinctApproverCount} ${plural(
            merged.distinctApproverCount,
            "reviewer",
          )}`
        : `Merged ${changes}`;

    return clampTitle(title, `Merged ${changes}`);
  }

  const reviews = period.reviewGiven;

  if (reviews) {
    const changes = `${reviews.reviewCount} ${plural(reviews.reviewCount, "change")}`;
    const title =
      reviews.distinctAuthorCount > 0
        ? `Reviewed ${changes} from ${reviews.distinctAuthorCount} ${plural(
            reviews.distinctAuthorCount,
            "engineer",
          )}`
        : `Reviewed ${changes}`;

    return clampTitle(title, `Reviewed ${changes}`);
  }

  const releases = period.releaseParticipation;

  if (releases) {
    return clampTitle(
      `Shipped ${releases.releaseCount} ${plural(releases.releaseCount, "release")}`,
      "Shipped a release",
    );
  }

  // Unreachable while `hasPublishableEvidence` gates the caller — one of the
  // three claims above must exist for a digest to be written at all — but a
  // title is not the place to throw.
  return `Development activity, ${period.window.from} to ${period.window.to}`;
}

function buildBody(
  input: RenderActivityDigestInput,
  stack: string[],
): string {
  const { period, recent, trackRecord } = input;

  const intro = `Evidence from my connected development activity, ${period.window.from} to ${period.window.to}.`;

  // Priority order, then truncated to the house limit. Ordered by how much a
  // reader can trust the number: warranted-by-others first, self-reported
  // consistency last.
  const bullets = [
    mergedBullet(period),
    reviewBullet(period),
    releaseBullet(period),
    densityBullet(trackRecord, input.blockedTerms),
    consistencyBullet(recent, trackRecord),
  ]
    .filter((bullet): bullet is string => bullet !== null)
    .slice(0, MAX_BULLETS)
    .map((bullet) => `- ${bullet}`);

  const closing = [
    stack.length > 0 ? `${stack.join(", ")}.` : null,
    // The provenance sentence is not filler: "where did this number come from"
    // is the question the whole product answers, and stating that no identity
    // is involved is what makes the numbers publishable at all.
    `Counted from ${period.totalEventCount} ingested activity ${plural(
      period.totalEventCount,
      "event",
    )}; no repository, employer or other engineer is named.`,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return [intro, "", ...bullets, "", closing].join("\n");
}

function mergedBullet(period: CandidateEvidence): string | null {
  const claim = period.thirdPartyWarrantedWork;
  if (!claim) return null;

  // The two numbers always travel together: the merge count is the volume, the
  // distinct-approver count is the warrant. Rendering the first alone is the
  // exact vanity metric the claim shape was designed to replace.
  if (claim.distinctApproverCount === 0) {
    return `Merged ${claim.mergedChangeCount} ${plural(claim.mergedChangeCount, "change")}.`;
  }

  return `Merged ${claim.mergedChangeCount} ${plural(
    claim.mergedChangeCount,
    "change",
  )}, approved by ${claim.distinctApproverCount} distinct ${plural(
    claim.distinctApproverCount,
    "reviewer",
  )}.`;
}

function reviewBullet(period: CandidateEvidence): string | null {
  const claim = period.reviewGiven;
  if (!claim) return null;

  if (claim.distinctAuthorCount === 0) {
    return `Reviewed ${claim.reviewCount} ${plural(claim.reviewCount, "change")} authored by others.`;
  }

  return `Reviewed ${claim.reviewCount} ${plural(
    claim.reviewCount,
    "change",
  )} authored by ${claim.distinctAuthorCount} other ${plural(
    claim.distinctAuthorCount,
    "engineer",
  )}.`;
}

function releaseBullet(period: CandidateEvidence): string | null {
  const claim = period.releaseParticipation;
  if (!claim) return null;

  return `Took part in ${claim.releaseCount} ${plural(claim.releaseCount, "release")}.`;
}

/**
 * The month-density claim, from the TRACK RECORD window rather than the period
 * — "43 of the last 48 months" is the point, and a seven-day window can only
 * ever say "1 of the last 1".
 */
function densityBullet(
  trackRecord: CandidateEvidence,
  blockedTerms: readonly string[],
): string | null {
  const claims = trackRecord.technologyMonthDensity.filter(
    (claim) =>
      filterBlockedTerms([claim.technology], blockedTerms).length === 1,
  );

  const [primary, ...rest] = claims;
  if (!primary) return null;

  const others = rest
    .slice(0, 2)
    .map((claim) => `${claim.technology} in ${claim.activeMonths}`);

  const tail = others.length > 0 ? `, ${others.join(", ")}` : "";

  return `Worked in ${primary.technology} in ${primary.activeMonths} of the last ${primary.windowMonths} months${tail}.`;
}

/**
 * Recency and sustained engagement, merged into one bullet so the body stays
 * inside the guide's five.
 *
 * Rendered as a FRACTION and never as a streak. A streak is fabricable with one
 * commit a day and, worse, publishing one turns a profile into a reason not to
 * take a week off. "11 of the last 13 weeks" says the same thing about
 * consistency and says nothing at all about the two weeks off.
 */
function consistencyBullet(
  recent: CandidateEvidence,
  trackRecord: CandidateEvidence,
): string | null {
  const recency = recent.recency;
  if (!recency) return null;

  const sustained = trackRecord.sustainedEngagement;

  const base = `Active in ${recency.activeWeeks} of the last ${recency.windowWeeks} ${plural(
    recency.windowWeeks,
    "week",
  )}`;

  if (!sustained) {
    return `${base}.`;
  }

  return `${base}, with ${sustained.activeMonthsOnDeepestCodebase} active months on one codebase.`;
}

/**
 * Drops any term the disclosure policy blocks.
 *
 * Technology tags are the only text in this template that did not originate
 * here — they come off an ingested event — so they are the only place an
 * employer name could enter a deterministic post. Filtering rather than
 * throwing is right for a tag: losing "acme" from a stack line costs nothing,
 * while refusing to publish would silently kill every digest for a user whose
 * employer shares a name with a framework.
 */
function filterBlockedTerms(
  values: readonly string[],
  blockedTerms: readonly string[],
): string[] {
  if (blockedTerms.length === 0) return [...values];

  return values.filter(
    (value) => findDisclosureViolations(value, blockedTerms).length === 0,
  );
}

/** English plurals for the handful of nouns this template uses. */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function clampTitle(title: string, fallback: string): string {
  return title.length <= MAX_TITLE_LENGTH ? title : fallback;
}
