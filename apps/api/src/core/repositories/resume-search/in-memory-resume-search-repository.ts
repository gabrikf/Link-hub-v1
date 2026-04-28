import {
  IResumeSearchRepository,
  ResumeSearchResult,
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
}

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

export class InMemoryResumeSearchRepository implements IResumeSearchRepository {
  private readonly items: SeededResumeSearchItem[] = [];

  seed(item: SeededResumeSearchItem) {
    this.items.push(item);
  }

  async searchByEmbedding(
    input: SearchResumesByEmbeddingInput,
  ): Promise<ResumeSearchResult[]> {
    const filtered = this.items.filter((item) => {
      const { filters } = input;

      if (
        filters.contractTypes?.length &&
        (!item.contractType ||
          !filters.contractTypes.includes(item.contractType))
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
        (!item.location || !filters.locations.includes(item.location))
      ) {
        return false;
      }

      if (
        filters.noticePeriods?.length &&
        (!item.noticePeriod ||
          !filters.noticePeriods.includes(item.noticePeriod))
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

      if (
        filters.spokenLanguages?.length &&
        !filters.spokenLanguages.some((lang) =>
          item.spokenLanguages.some(
            (candidate) => candidate.toLowerCase() === lang.toLowerCase(),
          ),
        )
      ) {
        return false;
      }

      return true;
    });

    return filtered
      .map((item) => ({
        userId: item.userId,
        resumeId: item.resumeId,
        username: item.username ?? item.userId,
        name: item.name ?? item.userId,
        userPhoto: item.userPhoto ?? null,
        profileDescription: item.profileDescription ?? null,
        email: item.email,
        similarity: cosineSimilarity(item.embedding, input.queryEmbedding),
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
        combinedText: [
          item.headlineTitle,
          item.summary,
          item.location,
          item.seniorityLevel,
          ...item.skills,
          ...item.titles,
        ]
          .filter((value) => Boolean(value && value.trim().length > 0))
          .join("\n"),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.topK);
  }
}
