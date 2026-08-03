import type { InteractionType } from "@repo/schemas";

export interface WorkExperienceTrainingRow {
  title: string | null;
  companyName: string | null;
  description: string | null;
  mainStack: string[];
}

/**
 * A published post, as the training pipeline sees it. Mirrors the `workEvidence`
 * projection the search API returns, so the features built here and the features
 * built in the browser come from the same shape.
 */
export interface PostTrainingRow {
  title: string | null;
  excerpt: string;
  source: string;
  tags: string[];
  publishedAt: string | null;
}

/** The candidate side of a training example. */
export interface CandidateTrainingProfile {
  resumeId: string;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  location: string | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  skills: string[];
  titles: string[];
  workExperiences: WorkExperienceTrainingRow[];
  posts: PostTrainingRow[];
}

/**
 * One flat interaction row, straight out of `candidate_interactions`.
 *
 * Interactions are loaded on their own rather than joined onto the resume query.
 * That is not a style choice: the old query joined `resume_skills` and
 * `resume_titles` alongside `candidate_interactions` and then wrapped the
 * interaction weights in `SUM(CASE …)`. `ARRAY_AGG(DISTINCT …)` de-duplicated
 * the skills, but nothing de-duplicated the SUM, so every interaction score was
 * multiplied by `#skills × #titles`. A candidate with 10 skills, 3 titles and a
 * single email copy scored 30 — and with `HAVING SUM(...) > 0` filtering
 * everything else away, effectively every real row carried label 1.0. The model
 * was learning how many chips someone had filled in.
 */
export interface InteractionTrainingRow {
  resumeId: string;
  interactionType: InteractionType;
  queryText: string | null;
  querySnapshot: Record<string, unknown> | null;
  candidateSnapshot: Record<string, unknown> | null;
  displayedRank: number | null;
  resultCount: number | null;
  searchSessionId: string | null;
  propensity: number | null;
  createdAt: Date;
}

/**
 * One training example: a (query, candidate) pair with a label.
 *
 * The label used to be per-RESUME while the features were per-(query,
 * candidate). Interactions were summed across every recruiter and every query,
 * then paired with `MAX(query_text)` — a lexicographically arbitrary query. A
 * candidate emailed once from a "Rust engineer" search and once from a "React
 * engineer" search collapsed into a single row teaching the model that a React
 * profile is a perfect match for a Rust query. One row per (query, candidate)
 * is the fix.
 */
export interface ResumeTrainingRow extends CandidateTrainingProfile {
  queryText: string | null;
  interactionScore: number;
  /** Exposure context, when the interaction carried it. */
  displayedRank?: number | null;
  resultCount?: number | null;
  searchSessionId?: string | null;
  propensity?: number | null;
  /** Wall-clock time of the interaction; drives the temporal split. */
  observedAt?: Date | null;
  /** Explicit label, for derived rows (skip-above negatives). */
  forcedLabel?: number;
  /** Marks rows the generator produced rather than rows a recruiter produced. */
  isSynthetic?: boolean;
}

export interface TrainingState {
  lastTrainingAt: string;
}
