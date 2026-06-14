import { z } from "zod/v4";
import {
  contractTypeSchema,
  seniorityLevelSchema,
  upsertResumeInputSchema,
  workModelSchema,
} from "../resume/index.js";
import {
  createWorkExperienceInputSchema,
  employmentTypeSchema,
} from "../work-experience/index.js";

/**
 * Lenient shape returned by the LLM extraction. Everything is optional/nullable
 * because resumes vary wildly and we never want a missing field to fail parsing.
 */
export const parsedWorkExperienceSchema = z.object({
  title: z.string(),
  companyName: z.string(),
  employmentType: employmentTypeSchema.nullish(),
  workModel: workModelSchema.nullish(),
  locationCity: z.string().nullish(),
  locationState: z.string().nullish(),
  locationCountry: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  isCurrent: z.boolean().nullish(),
  description: z.string().nullish(),
  mainStack: z.array(z.string()).nullish(),
});

export const parsedResumeDataSchema = z.object({
  headlineTitle: z.string().nullish(),
  summary: z.string().nullish(),
  totalYearsExperience: z.number().int().nullish(),
  location: z.string().nullish(),
  seniorityLevel: seniorityLevelSchema.nullish(),
  workModel: workModelSchema.nullish(),
  contractType: contractTypeSchema.nullish(),
  salaryExpectationMin: z.number().int().nullish(),
  salaryExpectationMax: z.number().int().nullish(),
  spokenLanguages: z.array(z.string()).nullish(),
  noticePeriod: z.string().nullish(),
  openToRelocation: z.boolean().nullish(),
  skills: z.array(z.string()).nullish(),
  titles: z.array(z.string()).nullish(),
  workExperiences: z.array(parsedWorkExperienceSchema).nullish(),
  profileName: z.string().nullish(),
  profileDescription: z.string().nullish(),
});

export const aiResumeImportParseResponseSchema = z.object({
  parsed: parsedResumeDataSchema,
});

/**
 * The user-reviewed selection that actually gets written to the database.
 */
export const applyAiResumeImportInputSchema = z.object({
  resume: upsertResumeInputSchema.optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  titles: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  primaryTitle: z.string().trim().min(1).max(60).nullable().optional(),
  workExperiences: z.array(createWorkExperienceInputSchema).max(50).optional(),
  profileName: z.string().trim().min(1).max(120).optional(),
  profileDescription: z.string().trim().max(800).nullable().optional(),
});

// Sent as raw text when the user pastes their resume instead of uploading a file.
export const aiResumeImportTextInputSchema = z.object({
  resumeText: z.string().trim().min(20).max(100_000),
});

export type ParsedResumeData = z.infer<typeof parsedResumeDataSchema>;
export type AiResumeImportParseResponse = z.infer<
  typeof aiResumeImportParseResponseSchema
>;
export type ApplyAiResumeImportInput = z.input<
  typeof applyAiResumeImportInputSchema
>;
