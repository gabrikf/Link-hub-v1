import { normalizeSearchText, type SearchSource } from "@repo/schemas";
import {
  CandidatePostRow,
  toRecruiterWorkExperiences,
  toWorkEvidence,
} from "../../use-case/resumes/shared/build-candidate-search-projection.js";
import {
  CandidateContactRecord,
  IResumeSearchRepository,
  RecruiterSearchFilters,
  ResumeSearchResult,
  ResumeSearchWorkExperience,
  SearchResumesByEmbeddingInput,
} from "./resume-search-repository.js";

interface SeededResumeSearchItem {
  userId: string;
  resumeId: string;
  username?: string;
  name?: string;
  userPhoto?: string | null;
  profileDescription?: string | null;
  email: string;
  embedding: number[];
  /**
   * Per-source vectors, mirroring `resume_section_embeddings`. Only the sources
   * a candidate actually has content for should be seeded — that is what makes
   * "skip a source cleanly" testable.
   */
  sectionEmbeddings?: Partial<Record<SearchSource, number[]>>;
  headlineTitle: string | null;
  summary: string | null;
  contractType: string | null;
  seniorityLevel: string | null;
  workModel: string | null;
  location: string | null;
  noticePeriod: string | null;
  openToRelocation: boolean;
  totalYearsExperience: number | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  spokenLanguages: string[];
  skills: string[];
  titles: string[];
  /**
   * Mirrors `users.open_to_work`, the authorization boundary the SQL repository
   * enforces. Defaults to `true` so existing tests keep their meaning; a test
   * that wants to prove the gate sets it to `false`.
   */
  openToWork?: boolean;
  /** Partial so tests can seed only the fields the assertion cares about. */
  workExperiences?: Array<Partial<ResumeSearchWorkExperience>>;
  /** Published posts, as they would come back from the posts table. */
  posts?: CandidatePostRow[];
}

/**
 * Every key of `RecruiterSearchFilters`, as data.
 *
 * The double used to implement 9 of the 17 filters and silently pass everything
 * for the rest (defect F23) — a test could "prove" a filter worked when the
 * production repository would have behaved completely differently. This list is
 * asserted against `RecruiterSearchFilters` in the conformance test, so adding a
 * filter to the type without implementing it here fails the build.
 */
export const IN_MEMORY_SUPPORTED_FILTERS = [
  "contractTypes",
  "seniorityLevels",
  "workModels",
  "locations",
  "noticePeriods",
  "openToRelocation",
  "minYearsExperience",
  "maxYearsExperience",
  "spokenLanguages",
  "skills",
  "titles",
  "minSalary",
  "maxSalary",
  "nameContains",
  "usernameContains",
  "profileTextContains",
] as const satisfies ReadonlyArray<keyof RecruiterSearchFilters>;

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Case- and accent-insensitive "one of", matching the SQL `= ANY(folded)`. */
function matchesAny(
  value: string | null | undefined,
  wanted: string[],
): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeSearchText(value);
  return wanted.includes(normalized);
}

/** Case- and accent-insensitive substring, matching the SQL folded `LIKE`. */
function includesFolded(
  haystack: string | null | undefined,
  needle: string,
): boolean {
  if (!haystack) {
    return false;
  }

  return normalizeSearchText(haystack).includes(normalizeSearchText(needle));
}

function normalizeTerms(values: string[]): string[] {
  return values.map((value) => normalizeSearchText(value)).filter(Boolean);
}

export class InMemoryResumeSearchRepository implements IResumeSearchRepository {
  private readonly items: SeededResumeSearchItem[] = [];

  seed(item: SeededResumeSearchItem) {
    this.items.push(item);
  }

  async searchByEmbedding(
    input: SearchResumesByEmbeddingInput,
  ): Promise<ResumeSearchResult[]> {
    const sources =
      input.sources && input.sources.length > 0
        ? Array.from(new Set(input.sources))
        : undefined;

    const filtered = this.items.filter((item) =>
      this.matchesFilters(item, input.filters),
    );

    const scored = filtered.flatMap((item) => {
      const scoring = this.score(item, input.queryEmbedding, sources);

      // A candidate with no vector in any selected source is not comparable and
      // is dropped, exactly as the SQL predicate drops them.
      if (scoring === null) {
        return [];
      }

      const workExperiences = toRecruiterWorkExperiences(
        item.workExperiences ?? [],
      );

      return [
        {
          userId: item.userId,
          resumeId: item.resumeId,
          username: item.username ?? item.userId,
          name: item.name ?? item.userId,
          userPhoto: item.userPhoto ?? null,
          profileDescription: item.profileDescription ?? null,
          // Never from a listing — see `ResumeSearchResult.email` (defect F3).
          email: null,
          similarity: scoring.similarity,
          ...(scoring.sourceSimilarity
            ? { sourceSimilarity: scoring.sourceSimilarity }
            : {}),
          headlineTitle: item.headlineTitle,
          summary: item.summary,
          totalYearsExperience: item.totalYearsExperience,
          location: item.location,
          seniorityLevel: item.seniorityLevel,
          workModel: item.workModel,
          contractType: item.contractType,
          spokenLanguages: item.spokenLanguages,
          noticePeriod: item.noticePeriod,
          openToRelocation: item.openToRelocation,
          salaryExpectationMin: item.salaryExpectationMin,
          salaryExpectationMax: item.salaryExpectationMax,
          skills: item.skills,
          titles: item.titles,
          workExperiences,
          workEvidence: toWorkEvidence(item.posts ?? []),
        } satisfies ResumeSearchResult,
      ];
    });

    return scored
      // Same total order as SQL: score first, then id. Without the id
      // tie-break two equally-scored candidates come back in seeding order
      // here and in executor order there, and the double stops predicting the
      // real thing.
      .sort((a, b) =>
        b.similarity === a.similarity
          ? a.resumeId.localeCompare(b.resumeId)
          : b.similarity - a.similarity,
      )
      .slice(0, input.topK);
  }

  async findCandidateContact(
    resumeId: string,
  ): Promise<CandidateContactRecord | null> {
    const item = this.items.find(
      (candidate) =>
        candidate.resumeId === resumeId && (candidate.openToWork ?? true),
    );

    if (!item) {
      return null;
    }

    return {
      resumeId: item.resumeId,
      userId: item.userId,
      name: item.name ?? item.userId,
      username: item.username ?? item.userId,
      email: item.email,
    };
  }

  /**
   * `max` over the selected sources — the same fusion the SQL repository uses.
   * See `DrizzleResumeSearchRepository.buildScopedSimilarity` for why.
   */
  private score(
    item: SeededResumeSearchItem,
    queryEmbedding: number[],
    sources: SearchSource[] | undefined,
  ): {
    similarity: number;
    sourceSimilarity?: Partial<Record<SearchSource, number>>;
  } | null {
    if (!sources) {
      return { similarity: cosineSimilarity(item.embedding, queryEmbedding) };
    }

    const sourceSimilarity: Partial<Record<SearchSource, number>> = {};

    for (const source of sources) {
      const embedding = item.sectionEmbeddings?.[source];
      if (embedding) {
        sourceSimilarity[source] = cosineSimilarity(embedding, queryEmbedding);
      }
    }

    const values = Object.values(sourceSimilarity);

    if (values.length === 0) {
      return null;
    }

    return { similarity: Math.max(...values), sourceSimilarity };
  }

  private matchesFilters(
    item: SeededResumeSearchItem,
    filters: RecruiterSearchFilters,
  ): boolean {
    // The authorization boundary, mirrored from SQL (defect F3).
    if (!(item.openToWork ?? true)) {
      return false;
    }

    if (
      filters.contractTypes?.length &&
      (!item.contractType || !filters.contractTypes.includes(item.contractType))
    ) {
      return false;
    }

    if (
      filters.seniorityLevels?.length &&
      (!item.seniorityLevel ||
        !filters.seniorityLevels.includes(item.seniorityLevel))
    ) {
      return false;
    }

    if (
      filters.workModels?.length &&
      (!item.workModel || !filters.workModels.includes(item.workModel))
    ) {
      return false;
    }

    if (
      filters.locations?.length &&
      !matchesAny(item.location, normalizeTerms(filters.locations))
    ) {
      return false;
    }

    if (
      filters.noticePeriods?.length &&
      !matchesAny(item.noticePeriod, normalizeTerms(filters.noticePeriods))
    ) {
      return false;
    }

    if (
      filters.openToRelocation !== undefined &&
      item.openToRelocation !== filters.openToRelocation
    ) {
      return false;
    }

    if (
      filters.minYearsExperience !== undefined &&
      (item.totalYearsExperience === null ||
        item.totalYearsExperience < filters.minYearsExperience)
    ) {
      return false;
    }

    if (
      filters.maxYearsExperience !== undefined &&
      (item.totalYearsExperience === null ||
        item.totalYearsExperience > filters.maxYearsExperience)
    ) {
      return false;
    }

    if (filters.spokenLanguages?.length) {
      const wanted = normalizeTerms(filters.spokenLanguages);
      const spoken = new Set(
        item.spokenLanguages.map((language) => normalizeSearchText(language)),
      );
      if (!wanted.some((language) => spoken.has(language))) {
        return false;
      }
    }

    // Substring, not equality — matches the SQL `LIKE '%term%'` against the
    // skills/titles catalog names.
    if (filters.skills?.length) {
      const matchesEverySkill = filters.skills.every((term) =>
        item.skills.some((skill) => includesFolded(skill, term)),
      );
      if (!matchesEverySkill) {
        return false;
      }
    }

    if (filters.titles?.length) {
      const matchesEveryTitle = filters.titles.every((term) =>
        item.titles.some((title) => includesFolded(title, term)),
      );
      if (!matchesEveryTitle) {
        return false;
      }
    }

    // Salary is a range overlap and NULL means "unstated", not "excluded" —
    // see the same comment in the SQL repository (defect F12).
    if (
      filters.minSalary !== undefined &&
      item.salaryExpectationMax !== null &&
      item.salaryExpectationMax < filters.minSalary
    ) {
      return false;
    }

    if (
      filters.maxSalary !== undefined &&
      item.salaryExpectationMin !== null &&
      item.salaryExpectationMin > filters.maxSalary
    ) {
      return false;
    }

    if (
      filters.nameContains &&
      !includesFolded(item.name ?? item.userId, filters.nameContains)
    ) {
      return false;
    }

    if (
      filters.usernameContains &&
      !includesFolded(item.username ?? item.userId, filters.usernameContains)
    ) {
      return false;
    }

    if (filters.profileTextContains) {
      const profileText = [
        item.summary,
        item.headlineTitle,
        item.profileDescription,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ");

      if (!includesFolded(profileText, filters.profileTextContains)) {
        return false;
      }
    }

    return true;
  }
}
