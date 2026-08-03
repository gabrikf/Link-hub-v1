import { z } from "zod/v4";
import { postSourceSchema } from "../posts/index.js";

export const seniorityLevelSchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
]);

export const workModelSchema = z.enum(["remote", "hybrid", "on-site"]);

/**
 * Which slice of a candidate the semantic search compares the query against.
 *
 * Each source is embedded on its own so a recruiter can ask "who has actually
 * shipped this?" (posts) separately from "who says they can do this?" (profile):
 * - `profile` — resume core: headline, summary, skills, titles, preferences
 * - `work`    — the work-experience history
 * - `posts`   — published posts
 */
export const searchSourceSchema = z.enum(["profile", "work", "posts"]);

/** Every source, the behaviour when the caller doesn't narrow the search. */
export const DEFAULT_SEARCH_SOURCES = ["profile", "work", "posts"] as const;

/**
 * Folds a free-text value down to the form both sides of a filter compare on:
 * accents stripped, whitespace collapsed, lowercased.
 *
 * The resume columns this is applied to (`location`, `notice_period`,
 * `spoken_languages`) are free text a candidate types, while the recruiter UI
 * offers a fixed list ("Sao Paulo", "Immediate", "English"). Without folding,
 * a candidate who wrote `São Paulo` is invisible to a `Sao Paulo` filter — the
 * exact bug F8 describes. This mirrors the `skills_catalog.normalized_name`
 * discipline already in the codebase (store/compare a normalised form, keep the
 * original for display), extended with accent folding because these columns are
 * Portuguese-facing.
 *
 * The SQL side must fold identically:
 *   regexp_replace(normalize(lower(col), NFD), '[̀-ͯ]', '', 'g')
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Bounds on the text handed to the embedding model when a resume is indexed.
 *
 * An embedding request that exceeds the model's context window is a hard 400,
 * and the job that produced it retries and then dies — leaving the candidate
 * with NO embedding row at all. Because recruiter search inner-joins the
 * embedding table, that candidate becomes permanently and silently invisible
 * (defect F27). Every unbounded input is therefore clipped here rather than
 * discovered at the provider.
 *
 * Budget: 12 roles x 600 chars + 20 posts x 400 chars + the resume core stays
 * well under 32 000 chars (~8k tokens), a third of text-embedding-3-small's
 * 8 191-token limit even before the hard `documentChars` backstop.
 */
export const RESUME_EMBEDDING_DOCUMENT_LIMITS = {
  /** At most this many roles are embedded (earliest display order first). */
  maxWorkExperiences: 12,
  /** Each `experience_detail` is truncated to this many characters. */
  workDescriptionChars: 600,
  /** At most this many published posts are embedded. */
  maxPosts: 20,
  /** Each post body is truncated to this many characters. */
  postBodyChars: 400,
  /** Hard backstop on any single embedding document. */
  documentChars: 32_000,
} as const;

/**
 * Bounds on the semantic query built when the LLM query-conversion call fails.
 *
 * The fallback concatenates the raw recruiter input, and `attachmentText` alone
 * is allowed 100 000 characters by `recruiterSearchInputSchema` — pasting a
 * whole job-description PDF straight into an embedding request is an instant
 * OpenAI 400 and an uncaught 500 for the recruiter (defect F21). The LLM path
 * is capped at 900 chars by its own prompt contract, so a 4 000-char ceiling on
 * the degraded path is generous rather than lossy.
 */
export const RECRUITER_QUERY_FALLBACK_LIMITS = {
  /** Chars of attachment text kept in the degraded (no-LLM) query. */
  attachmentTextChars: 2_000,
  /** Hard ceiling on the whole fallback query. */
  totalChars: 4_000,
} as const;

export const contractTypeSchema = z.enum([
  "clt",
  "pj",
  "freelance",
  "contract",
  "full-time",
  "part-time",
]);

export const resumeSkillSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  skillId: z.string(),
  skillName: z.string().min(1),
  yearsExperience: z.number().int().min(0).nullable(),
  displayOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const resumeTitleSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  titleId: z.string(),
  titleName: z.string().min(1),
  isPrimary: z.boolean(),
  displayOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const resumeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  headlineTitle: z.string().nullable(),
  summary: z.string().nullable(),
  totalYearsExperience: z.number().int().min(0).nullable(),
  location: z.string().nullable(),
  seniorityLevel: seniorityLevelSchema.nullable(),
  workModel: workModelSchema.nullable(),
  contractType: contractTypeSchema.nullable(),
  salaryExpectationMin: z.number().int().nullable(),
  salaryExpectationMax: z.number().int().nullable(),
  spokenLanguages: z.array(z.string()),
  noticePeriod: z.string().nullable(),
  openToRelocation: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  skills: z.array(resumeSkillSchema),
  titles: z.array(resumeTitleSchema),
});

export const publicResumeSchema = resumeSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertResumeInputSchema = z.object({
  headlineTitle: z.string().trim().min(1).max(120).nullable().optional(),
  summary: z.string().trim().max(800).nullable().optional(),
  totalYearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  seniorityLevel: seniorityLevelSchema.nullable().optional(),
  workModel: workModelSchema.nullable().optional(),
  contractType: contractTypeSchema.nullable().optional(),
  salaryExpectationMin: z.number().int().min(0).nullable().optional(),
  salaryExpectationMax: z.number().int().min(0).nullable().optional(),
  spokenLanguages: z.array(z.string().trim().min(1)).max(15).optional(),
  noticePeriod: z.string().trim().max(120).nullable().optional(),
  openToRelocation: z.boolean().optional(),
});

export const catalogItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  isDefault: z.boolean(),
  createdByUserId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createCatalogItemInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const addResumeSkillInputSchema = z.object({
  skillId: z.string(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
});

export const addResumeTitleInputSchema = z.object({
  titleId: z.string(),
  isPrimary: z.boolean().optional(),
});

export const bulkResumeSkillsInputSchema = z.object({
  items: z
    .array(addResumeSkillInputSchema)
    .max(100)
    .refine(
      (items) =>
        new Set(items.map((item) => item.skillId)).size === items.length,
      {
        message: "Duplicate skills are not allowed",
        path: ["items"],
      },
    ),
});

export const bulkResumeTitlesInputSchema = z.object({
  items: z
    .array(addResumeTitleInputSchema)
    .max(100)
    .refine(
      (items) =>
        new Set(items.map((item) => item.titleId)).size === items.length,
      {
        message: "Duplicate titles are not allowed",
        path: ["items"],
      },
    )
    .refine(
      (items) => items.filter((item) => item.isPrimary === true).length <= 1,
      {
        message: "Only one primary title is allowed",
        path: ["items"],
      },
    ),
});

export const usernameParamsSchema = z.object({
  username: z.string().min(1),
});

export const recruiterSearchFiltersSchema = z
  .object({
    contractTypes: z.array(contractTypeSchema).max(6).optional(),
    seniorityLevels: z.array(seniorityLevelSchema).max(6).optional(),
    workModels: z.array(workModelSchema).max(3).optional(),
    locations: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    noticePeriods: z
      .array(z.string().trim().min(1).max(120))
      .max(20)
      .optional(),
    openToRelocation: z.boolean().optional(),
    minYearsExperience: z.number().int().min(0).max(60).optional(),
    maxYearsExperience: z.number().int().min(0).max(60).optional(),
    spokenLanguages: z
      .array(z.string().trim().min(1).max(60))
      .max(20)
      .optional(),
    skills: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    titles: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    minSalary: z.number().int().min(0).max(1_000_000).optional(),
    maxSalary: z.number().int().min(0).max(1_000_000).optional(),
    nameContains: z.string().trim().min(1).max(120).optional(),
    usernameContains: z.string().trim().min(1).max(120).optional(),
    profileTextContains: z.string().trim().min(1).max(600).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.minYearsExperience !== undefined &&
      value.maxYearsExperience !== undefined &&
      value.minYearsExperience > value.maxYearsExperience
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Min years must be lower or equal to max years",
        path: ["maxYearsExperience"],
      });
    }

    if (
      value.minSalary !== undefined &&
      value.maxSalary !== undefined &&
      value.minSalary > value.maxSalary
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Min salary must be lower or equal to max salary",
        path: ["maxSalary"],
      });
    }
  });

export const recruiterSearchInputSchema = z
  .object({
    // Legacy field kept for backward compatibility while frontend migrates.
    query: z.string().trim().min(2).max(1000).optional(),
    chatPrompt: z.string().trim().min(1).max(8_000).optional(),
    attachmentText: z.string().trim().max(100_000).optional(),
    semanticSkills: z
      .array(z.string().trim().min(1).max(120))
      .max(30)
      .optional(),
    semanticTitles: z
      .array(z.string().trim().min(1).max(120))
      .max(30)
      .optional(),
    topK: z.number().int().min(1).max(100).optional(),
    // Restricts which per-source embeddings the semantic pass scores against.
    // Omitted means `DEFAULT_SEARCH_SOURCES` — all of them.
    sources: searchSourceSchema.array().min(1).optional(),
    whereQuery: recruiterSearchFiltersSchema.optional(),
    // Legacy field kept for backward compatibility while frontend migrates.
    filters: recruiterSearchFiltersSchema.optional(),
  })
  .superRefine((value, context) => {
    const hasSemanticInput = Boolean(
      value.query || value.chatPrompt || value.attachmentText,
    );

    const hasFilterInput = Boolean(
      value.semanticSkills?.length ||
        value.semanticTitles?.length ||
        value.whereQuery?.skills?.length ||
        value.whereQuery?.titles?.length ||
        value.whereQuery?.contractTypes?.length ||
        value.whereQuery?.seniorityLevels?.length ||
        value.whereQuery?.workModels?.length ||
        value.whereQuery?.locations?.length ||
        value.whereQuery?.spokenLanguages?.length ||
        value.whereQuery?.noticePeriods?.length ||
        value.whereQuery?.minYearsExperience !== undefined ||
        value.whereQuery?.maxYearsExperience !== undefined ||
        value.whereQuery?.minSalary !== undefined ||
        value.whereQuery?.maxSalary !== undefined ||
        value.whereQuery?.nameContains ||
        value.whereQuery?.usernameContains ||
        value.whereQuery?.profileTextContains,
    );

    if (!hasSemanticInput && !hasFilterInput) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide search text, file, or at least one filter to search",
        path: ["chatPrompt"],
      });
    }
  });

/**
 * Server-side caps applied to the proof-of-work payload attached to every
 * candidate in a recruiter search.
 *
 * A search returns up to 50 candidates in one response, so every per-candidate
 * field is bounded. The numbers below are the budget: at the worst case a single
 * candidate contributes ~12 x 600 chars of work description plus 3 x 240 chars
 * of post excerpt (~8 KB), keeping a full top-50 page comfortably under ~450 KB
 * instead of the unbounded payload that shipping raw 4000-char descriptions and
 * 20 000-char post bodies would produce.
 */
export const RECRUITER_SEARCH_EVIDENCE_LIMITS = {
  /** Work-experience descriptions are truncated to this many characters. */
  workDescriptionChars: 600,
  /** At most this many roles per candidate (most recent by display order). */
  maxWorkExperiences: 12,
  /** At most this many published posts per candidate. */
  maxPostsPerCandidate: 3,
  /** Post excerpts are truncated to this many characters — never full bodies. */
  postExcerptChars: 240,
} as const;

// Compact work-history shape returned alongside each candidate so the client
// reranker can compare the recruiter's search against where the candidate
// actually worked (role, company, accomplishments and the stack they used), and
// so the result card can show a real timeline instead of a bare role list.
//
// `employmentType` / `workModel` are plain strings rather than the stricter
// enums: they are free-text columns on `work_experiences`, and a legacy row with
// an off-enum value must not blow up parsing of an entire search response.
export const recruiterSearchWorkExperienceSchema = z.object({
  title: z.string(),
  companyName: z.string(),
  /** Truncated to `RECRUITER_SEARCH_EVIDENCE_LIMITS.workDescriptionChars`. */
  description: z.string().nullable(),
  mainStack: z.array(z.string()),
  /** ISO `YYYY-MM-DD`, as stored. */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  employmentType: z.string().nullable(),
  workModel: z.string().nullable(),
});

/**
 * A published post projected down to "evidence of shipped work". Deliberately
 * NOT the post body — recruiters get a headline, when it happened, the tags and
 * a short excerpt, and follow the profile/external link for the rest.
 *
 * `source: "commit"` posts are the strongest signal here: they are written by
 * the MCP server straight from the candidate's commit history.
 */
export const recruiterSearchWorkEvidenceSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  /** Truncated to `RECRUITER_SEARCH_EVIDENCE_LIMITS.postExcerptChars`. */
  excerpt: z.string(),
  source: postSourceSchema,
  tags: z.array(z.string()),
  publishedAt: z.coerce.date().nullable(),
  externalUrl: z.string().nullable(),
});

export const recruiterSearchResultSchema = z.object({
  userId: z.string(),
  resumeId: z.string(),
  username: z.string(),
  name: z.string(),
  userPhoto: z.string().nullable(),
  profileDescription: z.string().nullable(),
  similarity: z.number(),
  /**
   * Similarity per searched source, so the UI can say *why* a candidate
   * matched ("0.81 from posts, 0.42 from the resume"). Partial on purpose: a
   * source only appears when it was searched AND the candidate has an
   * embedding for it.
   */
  sourceSimilarity: z.partialRecord(searchSourceSchema, z.number()).optional(),
  /**
   * ALWAYS `null` in a search listing.
   *
   * `/resumes/search` is reachable by any signed-up account — there is no
   * recruiter role — so shipping the address here let anyone page every
   * candidate's email out of the product (defect F3). The field is kept on the
   * wire so existing clients keep parsing, but the value now only comes from
   * `POST /resumes/:resumeId/contact`, which is per-candidate, deliberate, and
   * recorded as a `CONTACT_CLICK` interaction.
   */
  email: z.string().email().nullable(),
  headlineTitle: z.string().nullable(),
  summary: z.string().nullable(),
  totalYearsExperience: z.number().int().min(0).nullable(),
  location: z.string().nullable(),
  seniorityLevel: seniorityLevelSchema.nullable(),
  workModel: workModelSchema.nullable(),
  contractType: contractTypeSchema.nullable(),
  spokenLanguages: z.array(z.string()),
  noticePeriod: z.string().nullable(),
  openToRelocation: z.boolean(),
  salaryExpectationMin: z.number().int().nullable(),
  salaryExpectationMax: z.number().int().nullable(),
  skills: z.array(z.string().min(1)),
  titles: z.array(z.string().min(1)),
  workExperiences: z.array(recruiterSearchWorkExperienceSchema),
  /** Recent published posts — what the candidate actually shipped. */
  workEvidence: z.array(recruiterSearchWorkEvidenceSchema),
});

export const recruiterSearchResolvedInputSchema = z.object({
  semanticQuery: z.string().min(1),
  filters: recruiterSearchFiltersSchema,
  semanticSkills: z.array(z.string()).optional(),
  semanticTitles: z.array(z.string()).optional(),
});

export const recruiterSearchResponseSchema = z.object({
  input: recruiterSearchResolvedInputSchema,
  candidates: recruiterSearchResultSchema.array(),
});

// ---------------------------------------------------------------------------
// Contact reveal
// ---------------------------------------------------------------------------

export const revealCandidateContactParamsSchema = z.object({
  resumeId: z.string().uuid(),
});

/**
 * Optional search context sent with a reveal so the interaction row carries the
 * same signal the list-level interactions do (which query, which rank). All of
 * it is optional: a reveal from a bookmarked profile has no search behind it.
 */
export const revealCandidateContactInputSchema = z
  .object({
    queryText: z.string().trim().max(4_000).optional(),
    semanticSimilarity: z.number().optional(),
    rankPosition: z.number().int().min(0).optional(),
    searchSessionId: z.string().trim().max(120).optional(),
  })
  .optional();

/**
 * What a recruiter gets back after deliberately asking for one candidate's
 * contact details. Deliberately narrow — this is the only path that returns an
 * email, and every call writes a `CONTACT_CLICK` interaction.
 */
export const candidateContactSchema = z.object({
  resumeId: z.string(),
  userId: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
});

export type ResumeResponse = z.infer<typeof resumeSchema>;
export type SearchSource = z.infer<typeof searchSourceSchema>;
export type BulkResumeSkillsInput = z.input<typeof bulkResumeSkillsInputSchema>;
export type BulkResumeTitlesInput = z.input<typeof bulkResumeTitlesInputSchema>;
export type RecruiterSearchInput = z.input<typeof recruiterSearchInputSchema>;
export type RecruiterSearchFilters = z.infer<
  typeof recruiterSearchFiltersSchema
>;
export type RecruiterSearchResult = z.infer<typeof recruiterSearchResultSchema>;
export type RecruiterSearchWorkExperience = z.infer<
  typeof recruiterSearchWorkExperienceSchema
>;
export type RecruiterSearchWorkEvidence = z.infer<
  typeof recruiterSearchWorkEvidenceSchema
>;
export type RecruiterSearchResponse = z.infer<
  typeof recruiterSearchResponseSchema
>;
export type CandidateContact = z.infer<typeof candidateContactSchema>;
export type RevealCandidateContactInput = z.infer<
  typeof revealCandidateContactInputSchema
>;
