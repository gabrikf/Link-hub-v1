import type { SearchSource } from "@repo/schemas";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import {
  IResumeSearchRepository,
  RecruiterSearchFilters,
} from "../../../repositories/resume-search/resume-search-repository.js";

export interface SearchResumesByRecruiterQueryInput {
  query: string;
  topK?: number;
  filters?: RecruiterSearchFilters;
  /**
   * Which slices of a candidate to compare against. Omitted keeps the blended
   * single-vector behaviour, so an unscoped search is unchanged.
   */
  sources?: SearchSource[];
}

export class SearchResumesByRecruiterQueryUseCase {
  constructor(
    private embeddingProvider: IEmbeddingProvider,
    private resumeSearchRepository: IResumeSearchRepository,
  ) {}

  async execute(input: SearchResumesByRecruiterQueryInput) {
    const cappedTopK = Math.min(Math.max(input.topK ?? 50, 1), 100);
    const queryEmbedding = await this.embeddingProvider.createEmbedding(
      input.query,
    );

    return this.resumeSearchRepository.searchByEmbedding({
      queryEmbedding,
      topK: cappedTopK,
      filters: input.filters ?? {},
      // Passed through untouched, including `undefined`: the repository is what
      // decides that "no sources" means the blended vector.
      sources: input.sources,
    });
  }
}
