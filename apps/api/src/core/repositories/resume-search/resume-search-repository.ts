import type { SearchSource } from "@repo/schemas";

export interface RecruiterSearchFilters {
  contractTypes?: string[];
  seniorityLevels?: string[];
  workModels?: string[];
  locations?: string[];
  noticePeriods?: string[];
  openToRelocation?: boolean;
  minYearsExperience?: number;
  maxYearsExperience?: number;
  spokenLanguages?: string[];
  skills?: string[];
  titles?: string[];
  minSalary?: number;
  maxSalary?: number;
  nameContains?: string;
  usernameContains?: string;
  profileTextContains?: string;
}

export interface SearchResumesByEmbeddingInput {
  queryEmbedding: number[];
  topK: number;
  filters: RecruiterSearchFilters;
  /**
   * Which per-source vectors to score against. Omitted (or empty) keeps the
   * historical behaviour exactly: one blended vector per candidate, from
   * `resume_embeddings`. When present, the scoped path reads
   * `resume_section_embeddings` and fuses the selected sources.
   */
  sources?: SearchSource[];
}

export interface ResumeSearchWorkExperience {
  title: string;
  companyName: string;
  /** Truncated — see RECRUITER_SEARCH_EVIDENCE_LIMITS.workDescriptionChars. */
  description: string | null;
  mainStack: string[];
  /** ISO `YYYY-MM-DD`, as stored on `work_experiences`. */
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  employmentType: string | null;
  workModel: string | null;
}

/**
 * A published post projected down to "evidence of shipped work" — headline,
 * date, tags and a short excerpt. Never the full body.
 */
export interface ResumeSearchWorkEvidence {
  id: string;
  title: string | null;
  excerpt: string;
  source: string;
  tags: string[];
  publishedAt: Date | null;
  externalUrl: string | null;
}

export interface ResumeSearchResult {
  userId: string;
  resumeId: string;
  username: string;
  name: string;
  userPhoto: string | null;
  profileDescription: string | null;
  similarity: number;
  /**
   * Per-source cosine similarity, present only on the `sources`-scoped path and
   * only for sources this candidate actually has a vector for. It is what lets
   * the UI say *why* someone matched ("0.81 from posts, 0.42 from the resume").
   */
  sourceSimilarity?: Partial<Record<SearchSource, number>>;
  /**
   * Always `null` from a search. The address is PII and `/resumes/search` is
   * reachable by every signed-up account, so it is only ever returned by the
   * per-candidate reveal endpoint, which records the access (defect F3).
   */
  email: string | null;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  location: string | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  skills: string[];
  titles: string[];
  workExperiences: ResumeSearchWorkExperience[];
  workEvidence: ResumeSearchWorkEvidence[];
}

/**
 * The contact details behind the reveal endpoint. Returned for one candidate at
 * a time, never in a listing.
 */
export interface CandidateContactRecord {
  resumeId: string;
  userId: string;
  name: string;
  username: string;
  email: string;
}

export interface IResumeSearchRepository {
  searchByEmbedding(
    input: SearchResumesByEmbeddingInput,
  ): Promise<ResumeSearchResult[]>;
  /**
   * Resolves one candidate's contact details.
   *
   * Subject to the same `open_to_work` boundary as the search itself: a
   * candidate who is not in the market must not have their address handed out
   * just because a recruiter kept an old `resumeId` from a previous session.
   */
  findCandidateContact(resumeId: string): Promise<CandidateContactRecord | null>;
}
