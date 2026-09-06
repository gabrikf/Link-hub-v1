import { z } from "zod/v4";

export const interactionTypeSchema = z.enum([
  "EMAIL_COPY",
  "CONTACT_CLICK",
  "PROFILE_VIEW",
  // The only explicit negative signal. Without it the model only ever learns
  // from candidates recruiters liked, and "not clicked" is far too noisy a
  // stand-in for "wrong candidate".
  "NOT_RELEVANT",
]);

/**
 * How much each interaction moves the training label, shared by the API, the
 * web app and the offline trainer so "a rejection is worth one email copy, with
 * the sign flipped" is stated exactly once.
 *
 * `NOT_RELEVANT` is negative on purpose. It used to be dropped on the floor: the
 * training SQL had no branch for it (`ELSE 0`), the initial-mode `HAVING > 0`
 * excluded any resume whose only signal was a rejection, and incremental mode
 * *summed* it with the positives — so five rejections made a candidate look
 * better than one. It is the only explicit negative the product collects.
 */
export const INTERACTION_LABEL_WEIGHTS = {
  EMAIL_COPY: 1.0,
  CONTACT_CLICK: 1.0,
  PROFILE_VIEW: 0.35,
  NOT_RELEVANT: -1.0,
} as const satisfies Record<z.infer<typeof interactionTypeSchema>, number>;

/** Interaction score that maps to label 1.0. */
export const INTERACTION_LABEL_SATURATION = 2;

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
  workExperiences: z
    .array(
      z.object({
        title: z.string(),
        companyName: z.string(),
        description: z.string().nullable(),
        mainStack: z.array(z.string()),
      }),
    )
    .optional(),
});

export const querySnapshotSchema = z.object({
  semanticQuery: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const createInteractionInputSchema = z.object({
  resumeId: z.uuid(),
  interactionType: interactionTypeSchema,
  queryText: z.string().trim().min(1).max(1000).nullable().optional(),
  semanticSimilarity: z.number().min(-1).max(1).nullable().optional(),
  rankPosition: z.number().int().min(1).max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  candidateSnapshot: candidateSnapshotSchema.optional(),
  querySnapshot: querySnapshotSchema.optional(),
  // Exposure context. Without it the training set can't tell "recruiter didn't
  // like this candidate" apart from "candidate was 40th and never seen", so
  // every signal below is what the debiasing (position bias / IPS) needs.
  /** 1-based position the candidate occupied when the recruiter acted. */
  displayedRank: z.number().int().min(1).max(500).nullable().optional(),
  /** Size of the result set at that moment. */
  resultCount: z.number().int().min(0).max(10_000).nullable().optional(),
  /** Groups every interaction produced by one search session. */
  searchSessionId: z.string().trim().min(1).max(120).nullable().optional(),
  /** Logged probability of exposure, for inverse-propensity weighting. */
  propensity: z.number().min(0).max(1).nullable().optional(),
});

export const interactionSchema = z.object({
  id: z.uuid(),
  resumeId: z.uuid(),
  recruiterId: z.uuid(),
  interactionType: interactionTypeSchema,
  queryText: z.string().nullable(),
  semanticSimilarity: z.number().nullable(),
  rankPosition: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  candidateSnapshot: candidateSnapshotSchema.nullable(),
  querySnapshot: querySnapshotSchema.nullable(),
  displayedRank: z.number().int().nullable().optional(),
  resultCount: z.number().int().nullable().optional(),
  searchSessionId: z.string().nullable().optional(),
  propensity: z.number().nullable().optional(),
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
