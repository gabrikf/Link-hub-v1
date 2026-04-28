import { z } from "zod/v4";

export const interactionTypeSchema = z.enum([
  "EMAIL_COPY",
  "CONTACT_CLICK",
  "PROFILE_VIEW",
]);

export const candidateSnapshotSchema = z.object({
  headlineTitle: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  totalYearsExperience: z.number().nullable().optional(),
  seniorityLevel: z.string().nullable().optional(),
  workModel: z.string().nullable().optional(),
  contractType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  spokenLanguages: z.array(z.string()).optional(),
  noticePeriod: z.string().nullable().optional(),
  openToRelocation: z.boolean().optional(),
  salaryExpectationMin: z.number().nullable().optional(),
  salaryExpectationMax: z.number().nullable().optional(),
  skills: z.array(z.string()).optional(),
  titles: z.array(z.string()).optional(),
});

export const querySnapshotSchema = z.object({
  semanticQuery: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const createInteractionInputSchema = z.object({
  resumeId: z.string().uuid(),
  interactionType: interactionTypeSchema,
  queryText: z.string().trim().min(1).max(1000).nullable().optional(),
  semanticSimilarity: z.number().min(-1).max(1).nullable().optional(),
  rankPosition: z.number().int().min(1).max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  candidateSnapshot: candidateSnapshotSchema.optional(),
  querySnapshot: querySnapshotSchema.optional(),
});

export const interactionSchema = z.object({
  id: z.string().uuid(),
  resumeId: z.string().uuid(),
  recruiterId: z.string().uuid(),
  interactionType: interactionTypeSchema,
  queryText: z.string().nullable(),
  semanticSimilarity: z.number().nullable(),
  rankPosition: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  candidateSnapshot: candidateSnapshotSchema.nullable(),
  querySnapshot: querySnapshotSchema.nullable(),
  trainedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type InteractionType = z.infer<typeof interactionTypeSchema>;
export type CandidateSnapshot = z.infer<typeof candidateSnapshotSchema>;
export type QuerySnapshot = z.infer<typeof querySnapshotSchema>;
export type CreateInteractionInput = z.input<
  typeof createInteractionInputSchema
>;
export type InteractionResponse = z.infer<typeof interactionSchema>;
