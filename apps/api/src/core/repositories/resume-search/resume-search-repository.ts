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
  combinedText: string;
}

export interface IResumeSearchRepository {
  searchByEmbedding(
    input: SearchResumesByEmbeddingInput,
  ): Promise<ResumeSearchResult[]>;
}
