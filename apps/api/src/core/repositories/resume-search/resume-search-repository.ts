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
  email: string;
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

export interface IResumeSearchRepository {
  searchByEmbedding(
    input: SearchResumesByEmbeddingInput,
  ): Promise<ResumeSearchResult[]>;
}
