import { z } from "zod";

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

export const usernameParamsSchema = z.object({
  username: z.string().min(1),
});

export type ResumeResponse = z.infer<typeof resumeSchema>;
