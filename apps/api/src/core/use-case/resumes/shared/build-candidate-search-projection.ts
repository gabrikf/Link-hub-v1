import { RECRUITER_SEARCH_EVIDENCE_LIMITS } from "@repo/schemas";
import {
  ResumeSearchWorkEvidence,
  ResumeSearchWorkExperience,
} from "../../../repositories/resume-search/resume-search-repository.js";

/**
 * Projection rules shared by every `IResumeSearchRepository` implementation.
 *
 * A recruiter search returns up to 50 candidates in a single response, so the
 * "proof of work" attached to each one has to be bounded: the caps live here so
 * the SQL repository and the in-memory repository can never drift apart.
 */

/**
 * How much raw material each candidate's projection is built from.
 *
 * Deliberately wider than what is rendered. `toWorkEvidence` reorders the posts
 * it is given so commit-sourced ones survive the visible cut — that reordering
 * is only meaningful if it gets more posts than it will keep. Fetching the 6
 * most recent and showing the best 3 is the point; fetching 3 would silently
 * turn "best evidence" back into "most recent".
 */
export const CANDIDATE_SEARCH_FETCH_LIMITS = {
  /** Chars of post body pulled out of Postgres, before excerpt truncation. */
  postBodyChars: 400,
  /** Chars of work-experience description pulled out of Postgres. */
  workDescriptionChars: 600,
  /** Posts fetched per candidate — a superset of the ones shown as evidence. */
  maxPosts: 6,
} as const;

/**
 * Raw work-experience row as read from the database, before projection. Every
 * field is nullable because it arrives via `json_build_object`, which has no
 * idea about the domain's NOT NULL columns.
 */
export interface CandidateWorkExperienceRow {
  title: string | null;
  companyName: string | null;
  description: string | null;
  mainStack: string[] | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean | null;
  employmentType: string | null;
  workModel: string | null;
}

/** Raw post row as read from the database, before projection. */
export interface CandidatePostRow {
  id: string;
  title: string | null;
  body: string;
  source: string;
  tags: string[] | null;
  externalUrl: string | null;
  publishedAt: Date | string | null;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Truncates on a word boundary when there is one nearby, so an excerpt reads as
 * a clipped sentence rather than a severed word. Appends an ellipsis only when
 * something was actually removed.
 */
export function truncateText(
  value: string | null | undefined,
  maxChars: number,
): string {
  const normalized = normalize(value ?? "");

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(" ");
  const body =
    lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return `${body.trimEnd()}…`;
}

function toDateOrNull(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The recruiter card renders this straight into an `<a href>`. Post creation
 * already restricts `externalUrl` to http(s) (`httpUrlSchema`), but a row that
 * predates that check — or one written by a future path that forgets it — must
 * not become a `javascript:` link in a recruiter's browser. Anything that is not
 * plainly http(s) is dropped rather than rendered.
 */
function toSafeHttpUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Caps a raw work-experience list for the recruiter payload: at most
 * `maxWorkExperiences` roles, each description truncated. Everything else is
 * passed through so the card can render a real timeline.
 */
export function toRecruiterWorkExperiences(
  rows: Array<Partial<CandidateWorkExperienceRow> | null | undefined>,
): ResumeSearchWorkExperience[] {
  return rows
    .filter((row): row is Partial<CandidateWorkExperienceRow> => Boolean(row))
    .slice(0, RECRUITER_SEARCH_EVIDENCE_LIMITS.maxWorkExperiences)
    .map((row) => ({
      title: row.title ?? "",
      companyName: row.companyName ?? "",
      description: row.description
        ? truncateText(
            row.description,
            RECRUITER_SEARCH_EVIDENCE_LIMITS.workDescriptionChars,
          )
        : null,
      mainStack: toStringArray(row.mainStack),
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      isCurrent: row.isCurrent ?? false,
      employmentType: row.employmentType ?? null,
      workModel: row.workModel ?? null,
    }));
}

/**
 * Projects published posts down to the compact "evidence" shape: a headline,
 * when it happened, tags, a short excerpt and the external link — never the
 * body. Commit-sourced posts are ordered first so the strongest evidence of
 * shipped work survives the `maxPostsPerCandidate` cut: a post the MCP server
 * wrote from real commit history is direct evidence of shipped work, so it
 * outranks a hand-written manual post.
 */
export function toWorkEvidence(
  rows: Array<CandidatePostRow | null | undefined>,
): ResumeSearchWorkEvidence[] {
  const posts = rows.filter((row): row is CandidatePostRow => Boolean(row));

  const commitFirst = [
    ...posts.filter((post) => post.source === "commit"),
    ...posts.filter((post) => post.source !== "commit"),
  ];

  return commitFirst
    .slice(0, RECRUITER_SEARCH_EVIDENCE_LIMITS.maxPostsPerCandidate)
    .map((post) => ({
      id: post.id,
      title: post.title ? normalize(post.title) : null,
      excerpt: truncateText(
        post.body,
        RECRUITER_SEARCH_EVIDENCE_LIMITS.postExcerptChars,
      ),
      source: post.source,
      tags: toStringArray(post.tags),
      publishedAt: toDateOrNull(post.publishedAt),
      externalUrl: toSafeHttpUrl(post.externalUrl),
    }));
}
