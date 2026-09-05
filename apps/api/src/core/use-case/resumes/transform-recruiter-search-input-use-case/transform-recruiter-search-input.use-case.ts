import {
  RECRUITER_QUERY_FALLBACK_LIMITS,
  type SearchSource,
} from "@repo/schemas";
import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
} from "../../../providers/query-conversion/recruiter-query-conversion-provider.js";
import { resolveResponseLanguage } from "../../../lang/resolve-response-language.js";
import { RecruiterSearchFilters } from "../../../repositories/resume-search/resume-search-repository.js";
import { IUserPreferencesRepository } from "../../../repositories/user-preferences/user-preferences-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";

export interface TransformRecruiterSearchInput {
  /** The authenticated recruiter. The route is auth-guarded, so it is never absent. */
  userId: string;
  /** The raw inbound `Accept-Language` header, passed through untouched. */
  acceptLanguage?: string | null;
  query?: string;
  chatPrompt?: string;
  attachmentText?: string;
  semanticSkills?: string[];
  semanticTitles?: string[];
  whereQuery?: RecruiterSearchFilters;
  filters?: RecruiterSearchFilters;
  topK?: number;
  sources?: SearchSource[];
}

function clipTo(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars).trimEnd();
}

/**
 * The degraded path, used when the LLM conversion fails: embed the recruiter's
 * own words instead of nothing.
 *
 * It has to be clipped first — `attachmentText` alone accepts 100 000
 * characters, and handing a whole job-description PDF to the embedding API is a
 * hard 400 that surfaces to the recruiter as an uncaught 500 (defect F21).
 * Better a slightly shorter query than no search at all.
 */
function buildFallbackSemanticQuery(
  input: TransformRecruiterSearchInput,
): string {
  return clipTo(
    [
      input.query,
      input.chatPrompt,
      input.attachmentText
        ? clipTo(
            input.attachmentText,
            RECRUITER_QUERY_FALLBACK_LIMITS.attachmentTextChars,
          )
        : undefined,
      input.semanticSkills?.join(", "),
      input.semanticTitles?.join(", "),
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n\n")
      .trim(),
    RECRUITER_QUERY_FALLBACK_LIMITS.totalChars,
  );
}

/**
 * Filter-only path: the recruiter typed nothing, so a compact semantic query is
 * assembled from the structured signals instead — the vector search still needs
 * meaningful input to embed.
 */
function buildFilterOnlySemanticQuery(
  input: TransformRecruiterSearchInput,
): string {
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

  return parts.join("\n");
}

export class TransformRecruiterSearchInputUseCase {
  constructor(
    private queryConversionProvider: IRecruiterQueryConversionProvider,
    private searchResumesByRecruiterQueryUseCase: SearchResumesByRecruiterQueryUseCase,
    private userPreferencesRepository: IUserPreferencesRepository,
  ) {}

  async execute(input: TransformRecruiterSearchInput) {
    // `findByUserId`, not `provisionDefaults`: a search is a read and must not
    // write a preferences row as a side effect.
    const preferences = await this.userPreferencesRepository.findByUserId(
      input.userId,
    );

    /**
     * Detection runs on what the recruiter themselves wrote, not on
     * `attachmentText` — an uploaded job description is somebody else's prose,
     * and a JD drafted in English by a Brazilian recruiter should not decide
     * the recruiter's language.
     *
     * What this language does and does not do is D6 territory: it is stated to
     * the provider so it can pin its retrieval labels to English against it.
     * It never translates the query.
     */
    const language = resolveResponseLanguage({
      userText: input.chatPrompt ?? input.query,
      preference: preferences?.language ?? null,
      acceptLanguage: input.acceptLanguage,
    });

    const conversionInput: BuildRecruiterSemanticQueryInput = {
      legacyQuery: input.query,
      chatPrompt: input.chatPrompt,
      attachmentText: input.attachmentText,
      semanticSkills: input.semanticSkills,
      semanticTitles: input.semanticTitles,
      language,
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
        semanticQuery = buildFallbackSemanticQuery(input);
      }
    } else {
      semanticQuery = buildFilterOnlySemanticQuery(input);
    }

    if (!semanticQuery) {
      throw new Error("Unable to build semantic query from provided input");
    }

    const whereQuery = input.whereQuery ?? input.filters ?? {};

    const candidates = await this.searchResumesByRecruiterQueryUseCase.execute({
      query: semanticQuery,
      topK: input.topK,
      filters: whereQuery,
      sources: input.sources,
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
