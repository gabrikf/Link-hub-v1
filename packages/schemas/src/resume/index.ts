import { z } from "zod/v4";

export const seniorityLevelSchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
]);

export const workModelSchema = z.enum(["remote", "hybrid", "on-site"]);

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

export const recruiterSearchResultSchema = z.object({
  userId: z.string(),
  resumeId: z.string(),
  username: z.string(),
  name: z.string(),
  userPhoto: z.string().nullable(),
  profileDescription: z.string().nullable(),
  similarity: z.number(),
  email: z.string().email(),
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
  combinedText: z.string(),
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

export type ResumeResponse = z.infer<typeof resumeSchema>;
export type BulkResumeSkillsInput = z.input<typeof bulkResumeSkillsInputSchema>;
export type BulkResumeTitlesInput = z.input<typeof bulkResumeTitlesInputSchema>;
export type RecruiterSearchInput = z.input<typeof recruiterSearchInputSchema>;
export type RecruiterSearchFilters = z.infer<
  typeof recruiterSearchFiltersSchema
>;
export type RecruiterSearchResult = z.infer<typeof recruiterSearchResultSchema>;
export type RecruiterSearchResponse = z.infer<
  typeof recruiterSearchResponseSchema
>;
