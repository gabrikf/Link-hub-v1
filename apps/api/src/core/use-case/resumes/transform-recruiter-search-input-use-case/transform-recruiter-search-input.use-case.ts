import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
} from "../../../providers/query-conversion/recruiter-query-conversion-provider.js";
import { RecruiterSearchFilters } from "../../../repositories/resume-search/resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";

export interface TransformRecruiterSearchInput {
  query?: string;
  chatPrompt?: string;
  attachmentText?: string;
  semanticSkills?: string[];
  semanticTitles?: string[];
  whereQuery?: RecruiterSearchFilters;
  filters?: RecruiterSearchFilters;
  topK?: number;
}

export class TransformRecruiterSearchInputUseCase {
  constructor(
    private queryConversionProvider: IRecruiterQueryConversionProvider,
    private searchResumesByRecruiterQueryUseCase: SearchResumesByRecruiterQueryUseCase,
  ) {}

  async execute(input: TransformRecruiterSearchInput) {
    const conversionInput: BuildRecruiterSemanticQueryInput = {
      legacyQuery: input.query,
      chatPrompt: input.chatPrompt,
      attachmentText: input.attachmentText,
      semanticSkills: input.semanticSkills,
      semanticTitles: input.semanticTitles,
    };

    const hasTextInput = Boolean(
      input.query || input.chatPrompt || input.attachmentText,
    );

    let semanticQuery = "";

    if (hasTextInput) {
      try {
        const converted =
          await this.queryConversionProvider.buildSemanticQuery(
            conversionInput,
          );
        semanticQuery = converted.semanticQuery.trim();
      } catch {
        semanticQuery = [
          input.query,
          input.chatPrompt,
          input.attachmentText,
          input.semanticSkills?.join(", "),
          input.semanticTitles?.join(", "),
        ]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join("\n\n")
          .trim();
      }
    } else {
      // Filter-only path: build a compact semantic query from available signals
      // so the vector search still has meaningful input to embed.
      const wq = input.whereQuery ?? input.filters ?? {};
      const parts: string[] = [];

      if (input.semanticSkills?.length) {
        parts.push(`Skills: ${input.semanticSkills.join(", ")}`);
      }

      if (input.semanticTitles?.length) {
        parts.push(`Titles: ${input.semanticTitles.join(", ")}`);
      }

      if (wq.skills?.length) {
        parts.push(`Required skills: ${wq.skills.join(", ")}`);
      }

      if (wq.titles?.length) {
        parts.push(`Required titles: ${wq.titles.join(", ")}`);
      }

      if (wq.seniorityLevels?.length) {
        parts.push(`Seniority: ${wq.seniorityLevels.join(", ")}`);
      }

      if (wq.workModels?.length) {
        parts.push(`Work model: ${wq.workModels.join(", ")}`);
      }

      if (wq.contractTypes?.length) {
        parts.push(`Contract: ${wq.contractTypes.join(", ")}`);
      }

      if (wq.locations?.length) {
        parts.push(`Location: ${wq.locations.join(", ")}`);
      }

      if (wq.spokenLanguages?.length) {
        parts.push(`Languages: ${wq.spokenLanguages.join(", ")}`);
      }

      semanticQuery = parts.join("\n");
    }

    if (!semanticQuery) {
      throw new Error("Unable to build semantic query from provided input");
    }

    const whereQuery = input.whereQuery ?? input.filters ?? {};

    const candidates = await this.searchResumesByRecruiterQueryUseCase.execute({
      query: semanticQuery,
      topK: input.topK,
      filters: whereQuery,
    });

    return {
      input: {
        semanticQuery,
        filters: whereQuery,
        semanticSkills: input.semanticSkills,
        semanticTitles: input.semanticTitles,
      },
      candidates,
    };
  }
}
