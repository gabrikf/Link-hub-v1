import { memo, useState, type Ref } from "react";
import { Link } from "@tanstack/react-router";
import type {
  RecruiterSearchWorkEvidence,
  RecruiterSearchWorkExperience,
} from "@repo/schemas";
import {
  FiBriefcase,
  FiChevronDown,
  FiChevronUp,
  FiExternalLink,
  FiGitCommit,
  FiGlobe,
  FiMail,
  FiMapPin,
  FiThumbsDown,
  FiUser,
} from "react-icons/fi";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import {
  LoadingLabel,
  Skeleton,
  SkeletonChips,
  SkeletonText,
} from "../../../shared-components/skeleton";
import {
  BADGE,
  FOCUS_RING,
  SURFACE,
  SURFACE_EMPTY,
} from "../../../shared-components/surface";
import { markdownExcerpt } from "../../posts/lib/markdown";
import { SOURCE_META, formatPostDate } from "../../posts/lib/post-format";
import type { RankedCandidate } from "../types/advanced-search";
import {
  describeMatch,
  formatTenure,
  formatWorkPeriod,
} from "../utils/advanced-search";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Roles shown before the card collapses the rest behind a toggle. */
const VISIBLE_ROLE_COUNT = 3;

const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800";

const PANEL_CLASS = "rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60";

type WorkHistoryProps = {
  experiences: RecruiterSearchWorkExperience[];
};

/**
 * The candidate's real job history: role, company, when, for how long, what
 * they did and what they used. This is the part a recruiter reads — it used to
 * be three lines of `title · company — 6 stack items` with no dates at all.
 */
function WorkHistory({ experiences }: WorkHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (experiences.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No work history listed
      </p>
    );
  }

  const hiddenCount = experiences.length - VISIBLE_ROLE_COUNT;
  const visible =
    isExpanded || hiddenCount <= 0
      ? experiences
      : experiences.slice(0, VISIBLE_ROLE_COUNT);

  return (
    <>
      <ol className="space-y-3">
        {visible.map((experience, index) => {
          const period = formatWorkPeriod(
            experience.startDate,
            experience.endDate,
            experience.isCurrent,
          );
          const tenure = formatTenure(
            experience.startDate,
            experience.endDate,
            experience.isCurrent,
          );
          const arrangement = [experience.employmentType, experience.workModel]
            .filter((value): value is string => Boolean(value))
            .join(" · ");

          return (
            <li
              key={`${experience.companyName}-${experience.title}-${index}`}
              className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
            >
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {experience.title}
                <span className="text-zinc-500 dark:text-zinc-400">
                  {" "}
                  at {experience.companyName}
                </span>
                {experience.isCurrent ? (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE.success}`}
                  >
                    Current
                  </span>
                ) : null}
              </p>

              {period || tenure || arrangement ? (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {[period, tenure, arrangement]
                    .filter((value) => value.length > 0)
                    .join(" · ")}
                </p>
              ) : null}

              {experience.description ? (
                // Excerpted, not rendered: descriptions are Markdown bullet
                // lists now, and a three-line clamp is the wrong place for a
                // list. `markdownExcerpt` drops the `-`/`•` markers so the card
                // shows prose instead of a row of stray dashes.
                <p className="mt-1 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {markdownExcerpt(experience.description, 300)}
                </p>
              ) : null}

              {experience.mainStack.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {experience.mainStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className={`mt-2 inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-violet-700 hover:underline dark:text-violet-300 ${FOCUS_RING}`}
        >
          {isExpanded ? (
            <>
              <FiChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Show fewer roles
            </>
          ) : (
            <>
              <FiChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              Show {hiddenCount} more role{hiddenCount === 1 ? "" : "s"}
            </>
          )}
        </button>
      ) : null}
    </>
  );
}

type ShippedWorkProps = {
  evidence: RecruiterSearchWorkEvidence[];
};

/**
 * Published posts as proof of shipped work. Commit-sourced posts are written by
 * the MCP server straight from the candidate's commit history, so they are the
 * closest thing here to "here is what this person actually built".
 */
function ShippedWork({ evidence }: ShippedWorkProps) {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
        <FiGitCommit className="h-3.5 w-3.5" aria-hidden="true" />
        Shipped work
      </p>

      <ul className="mt-1.5 space-y-2">
        {evidence.map((post) => {
          const sourceMeta = SOURCE_META[post.source];

          return (
            <li
              key={post.id}
              className="rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    sourceMeta.className,
                  )}
                >
                  {sourceMeta.label}
                </span>
                {post.title ? (
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {post.title}
                  </span>
                ) : null}
                {post.publishedAt ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatPostDate(post.publishedAt)}
                  </span>
                ) : null}
                {post.externalUrl ? (
                  <a
                    href={post.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline dark:text-violet-300"
                  >
                    <FiExternalLink className="h-3 w-3" aria-hidden="true" />
                    Source
                  </a>
                ) : null}
              </div>

              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">
                {post.excerpt}
              </p>

              {post.tags.length > 0 ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {post.tags.map((tag) => `#${tag}`).join(" ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type CandidateAction = (candidate: RankedCandidate, index: number) => void;

type CandidateCardProps = {
  candidate: RankedCandidate;
  index: number;
  onCopyEmail: CandidateAction;
  onViewProfile: CandidateAction;
  onNotRelevant: CandidateAction;
};

const CandidateCard = memo(function CandidateCard({
  candidate,
  index,
  onCopyEmail,
  onViewProfile,
  onNotRelevant,
}: CandidateCardProps) {
  const match = describeMatch(candidate.aiScore);
  const years = candidate.totalYearsExperience;
  // Local only: the card stays on screen (the recruiter may have mis-tapped)
  // but stops pretending it is still a live suggestion.
  const [isDismissed, setIsDismissed] = useState(false);

  // The card had no background at all: in dark mode it was invisible except for
  // its border, while every other card in the app carries a fill.
  return (
    <article
      style={{ animationDelay: `${index * 0.07}s` }}
      className={cx(
        "anim-fade-up rounded-xl border border-zinc-200 bg-white p-4 transition-all duration-300 hover:border-violet-400/70 hover:shadow-[0_0_26px_-8px_rgba(139,92,246,0.55)] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-violet-500/60",
        isDismissed && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Avatar
              name={candidate.name}
              imageUrl={candidate.userPhoto}
              size={40}
            />
            <div className="min-w-0">
              {/* `max-w-full` + `truncate`: the link is `inline-flex`, so it
                  sized to max-content and long names overflowed the card and
                  were silently clipped. */}
              <Link
                to="/profile/$username"
                params={{ username: candidate.username }}
                title={candidate.name}
                // Opening a candidate's profile is a real, if weak, preference
                // signal — and until now nothing in the app ever emitted
                // PROFILE_VIEW, so the training branch that weights it was
                // unreachable.
                onClick={() => onViewProfile(candidate, index)}
                className={`inline-flex max-w-full items-center gap-1 rounded-sm text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100 ${FOCUS_RING}`}
              >
                <FiUser className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{candidate.name}</span>
              </Link>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                @{candidate.username}
              </p>
            </div>
          </div>

          <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {candidate.headlineTitle ?? "Candidate without headline"}
            {years !== null ? (
              <span className="text-zinc-500 dark:text-zinc-400">
                {" "}
                · {years} year{years === 1 ? "" : "s"} of experience
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {candidate.summary ??
              candidate.profileDescription ??
              "No summary provided"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {/* No `anim-sheen`: that animation is what `Skeleton` uses, so it
              means "still loading" everywhere else in the app. On a card whose
              data has arrived it is a semantic collision. */}
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
              match.className,
            )}
          >
            {match.percent}
            <span className="text-xs font-medium opacity-80">
              {match.label}
            </span>
          </span>

          {/* Search listings no longer carry email addresses at all — the field
              is `null` for everyone. This asks the server to reveal ONE
              address, which is also what records the CONTACT_CLICK. */}
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => onCopyEmail(candidate, index)}
          >
            <FiMail className="h-4 w-4" aria-hidden="true" />
            Reveal Email
          </Button>

          {/* The only explicit negative a recruiter can give us. Everything
              else the model learns from is a positive or an inference from
              absence, which is far noisier than one deliberate "no". */}
          <button
            type="button"
            disabled={isDismissed}
            onClick={() => {
              setIsDismissed(true);
              onNotRelevant(candidate, index);
            }}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:cursor-default disabled:no-underline dark:text-zinc-400 dark:hover:text-zinc-200 ${FOCUS_RING}`}
          >
            <FiThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            {isDismissed ? "Marked not relevant" : "Not relevant"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span className={CHIP_CLASS}>
          <FiMapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {candidate.location ?? "Unknown location"}
        </span>
        <span className={CHIP_CLASS}>
          {candidate.seniorityLevel ?? "seniority n/a"}
        </span>
        <span className={CHIP_CLASS}>
          {candidate.workModel ?? "work model n/a"}
        </span>
        <span className={CHIP_CLASS}>
          {candidate.contractType ?? "contract n/a"}
        </span>
        {candidate.noticePeriod ? (
          <span className={CHIP_CLASS}>Notice: {candidate.noticePeriod}</span>
        ) : null}
        <span className={CHIP_CLASS}>
          Relocation {candidate.openToRelocation ? "yes" : "no"}
        </span>
      </div>

      {/* Proof of work — the reason this card exists. */}
      <section className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
        <h3 className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-200">
          <FiBriefcase className="h-3.5 w-3.5" aria-hidden="true" />
          Proof of work
        </h3>

        <div className="mt-2">
          <WorkHistory experiences={candidate.workExperiences} />
        </div>

        <ShippedWork evidence={candidate.workEvidence} />
      </section>

      {/* Secondary detail — self-declared, so it sits below the real evidence. */}
      <div className="mt-3 grid gap-2 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-3">
        <div className={PANEL_CLASS}>
          <p className="font-semibold">Skills</p>
          <p className="mt-1 line-clamp-2">
            {candidate.skills.length > 0
              ? candidate.skills.join(", ")
              : "No skills listed"}
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="font-semibold">Titles</p>
          <p className="mt-1 line-clamp-2">
            {candidate.titles.length > 0
              ? candidate.titles.join(", ")
              : "No titles listed"}
          </p>
        </div>

        <div className={PANEL_CLASS}>
          <p className="inline-flex items-center gap-1 font-semibold">
            <FiGlobe className="h-3.5 w-3.5" aria-hidden="true" />
            Languages
          </p>
          <p className="mt-1 line-clamp-2">
            {candidate.spokenLanguages.length > 0
              ? candidate.spokenLanguages.join(", ")
              : "No languages listed"}
          </p>
        </div>
      </div>
    </article>
  );
});

/** Placeholder shaped like a real result card, so nothing jumps on arrival. */
function CandidateCardSkeleton({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 0.07}s` }}
      className="anim-fade-up rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton shape="circle" width={40} height={40} />
          <div className="flex-1">
            <Skeleton shape="text" width="35%" />
            <Skeleton shape="text" width="20%" className="mt-2" />
          </div>
        </div>
        <Skeleton shape="circle" width={120} height={30} />
      </div>

      <SkeletonText lines={2} className="mt-3" />
      <SkeletonChips count={5} className="mt-3" />

      <div className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
        <Skeleton shape="text" width="30%" />
        <SkeletonText lines={3} className="mt-3" />
        <SkeletonChips count={3} className="mt-3" />
      </div>
    </div>
  );
}

const SKELETON_CARD_COUNT = 3;

/** Names the results region, which the page focuses once a search lands. */
const RESULTS_HEADING_ID = "search-results-heading";

type SearchResultsProps = {
  results: RankedCandidate[];
  isBusy: boolean;
  /** False until the first search completes — separates "not yet" from "none". */
  hasSearched: boolean;
  /**
   * Set when the on-device reranker failed. Visible, but non-blocking: the
   * results below are real, they are just in the API's order.
   */
  degradedNotice?: string | null;
  onCopyEmail: CandidateAction;
  onViewProfile?: CandidateAction;
  onNotRelevant?: CandidateAction;
  /**
   * The page focuses this region once a search lands. Results start below a
   * phone's fold, so without moving the viewport a successful search looks
   * exactly like no search at all.
   */
  ref?: Ref<HTMLElement>;
};

const noopAction: CandidateAction = () => {};

/**
 * What a screen reader hears when a search finishes.
 *
 * Empty while a search is in flight — `LoadingLabel` already announces that —
 * and empty before the first search, so the region only ever speaks about an
 * outcome. It stays mounted either way: a live region inserted together with
 * its text is unreliably announced.
 */
function describeSearchOutcome(
  isBusy: boolean,
  hasSearched: boolean,
  resultCount: number,
): string {
  if (isBusy || !hasSearched) {
    return "";
  }

  if (resultCount === 0) {
    // Deliberately not the empty state's own wording: focus lands on this
    // region, so the reader meets that paragraph — and its remediation advice
    // — a moment later. Announcing it twice is noise.
    return "No candidates found.";
  }

  return `${resultCount} candidate${resultCount === 1 ? "" : "s"} found.`;
}

export function SearchResults({
  results,
  isBusy,
  hasSearched,
  degradedNotice = null,
  onCopyEmail,
  onViewProfile = noopAction,
  onNotRelevant = noopAction,
  ref,
}: SearchResultsProps) {
  // A search in flight used to render nothing at all — no cards, no empty
  // state — so the page looked broken for the seconds the reranker takes.
  const isLoadingFirstResults = isBusy && results.length === 0;

  return (
    <section
      ref={ref}
      // Focusable only programmatically, and named, so landing here says
      // "Results" rather than dropping the reader into an anonymous group.
      tabIndex={-1}
      aria-labelledby={RESULTS_HEADING_ID}
      // `scroll-mt-20` clears the sticky top bar: without it the scroll lands
      // the "Results" header underneath the nav and the recruiter arrives at a
      // region whose own heading is hidden.
      className={`scroll-mt-20 p-6 ${SURFACE} ${FOCUS_RING}`}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={RESULTS_HEADING_ID} className="text-base font-semibold">
          Results
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {isBusy
            ? "Ranking candidates…"
            : hasSearched
              ? `${results.length} candidates re-ranked locally`
              : "Re-ranked on your device"}
        </p>
      </header>

      {/* The visible count above is a static label a reader only meets by
          walking to it. This is the part that speaks when results land.

          A bare `aria-live` rather than `role="status"`: this section already
          carries two status roles — the degraded-ranking notice and the
          loading label — and a third would compete with them for no gain. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {describeSearchOutcome(isBusy, hasSearched, results.length)}
      </p>

      {/* What the % on each card means. This lived only in a native `title=`
          tooltip: no hover affordance, unreachable by keyboard, invisible on
          touch — so "62%" read as a probability of something. */}
      <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          Match
        </span>{" "}
        is how much of your search a candidate covers — skills, titles and real
        work history weigh heaviest. It is not a probability of anything.
      </p>

      {/* Non-blocking on purpose: the candidates below are real and the search
          succeeded. Only the on-device ranking is missing. */}
      {degradedNotice ? (
        <p
          role="status"
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${BADGE.warning}`}
        >
          {degradedNotice}
        </p>
      ) : null}

      <div className="grid gap-3">
        {isLoadingFirstResults ? (
          <>
            <LoadingLabel>Searching candidates</LoadingLabel>
            {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
              <CandidateCardSkeleton key={index} index={index} />
            ))}
          </>
        ) : null}

        {results.map((candidate, index) => (
          <CandidateCard
            key={candidate.resumeId}
            candidate={candidate}
            index={index}
            onCopyEmail={onCopyEmail}
            onViewProfile={onViewProfile}
            onNotRelevant={onNotRelevant}
          />
        ))}

        {/* Two genuinely different states. The second used to tell a recruiter
            whose filters were too narrow to "write in the chat box to start". */}
        {!isBusy && results.length === 0 ? (
          <p
            className={`px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400 ${SURFACE_EMPTY}`}
          >
            {hasSearched
              ? "No candidates matched this search. Try removing a mandatory filter, widening the years of experience, or describing the role in less specific terms."
              : "No results yet. Write in the chat box or upload a file to start."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
