import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import {
  IResumeSearchRepository,
  RecruiterSearchFilters,
} from "../../../repositories/resume-search/resume-search-repository.js";

export interface SearchResumesByRecruiterQueryInput {
  query: string;
  topK?: number;
  filters?: RecruiterSearchFilters;
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
    });
  }
}
