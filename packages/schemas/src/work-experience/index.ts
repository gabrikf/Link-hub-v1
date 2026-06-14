import { z } from "zod/v4";
import { workModelSchema } from "../resume/index.js";

export const employmentTypeSchema = z.enum([
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
  "temporary",
]);

// Stored as a Postgres `date` (YYYY-MM-DD). Frontend uses month granularity and
// normalizes to the first day of the month.
const workDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const workExperienceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  employmentType: employmentTypeSchema.nullable(),
  workModel: workModelSchema.nullable(),
  locationCity: z.string().nullable(),
  locationState: z.string().nullable(),
  locationCountry: z.string().nullable(),
  startDate: workDateSchema.nullable(),
  endDate: workDateSchema.nullable(),
  isCurrent: z.boolean(),
  description: z.string().nullable(),
  mainStack: z.array(z.string()),
  displayOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const publicWorkExperienceSchema = workExperienceSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
});

const workExperienceFields = {
  title: z.string().trim().min(1).max(120),
  companyName: z.string().trim().min(1).max(120),
  employmentType: employmentTypeSchema.nullable().optional(),
  workModel: workModelSchema.nullable().optional(),
  locationCity: z.string().trim().max(120).nullable().optional(),
  locationState: z.string().trim().max(120).nullable().optional(),
  locationCountry: z.string().trim().max(120).nullable().optional(),
  startDate: workDateSchema.nullable().optional(),
  endDate: workDateSchema.nullable().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  mainStack: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
};

function refineWorkDates(
  value: { startDate?: string | null; endDate?: string | null; isCurrent?: boolean },
  context: z.RefinementCtx,
) {
  if (value.isCurrent && value.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A current role can't have an end date",
      path: ["endDate"],
    });
  }

  if (
    value.startDate &&
    value.endDate &&
    value.startDate > value.endDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start date must be before the end date",
      path: ["endDate"],
    });
  }
}

export const createWorkExperienceInputSchema = z
  .object(workExperienceFields)
  .superRefine(refineWorkDates);

export const updateWorkExperienceInputSchema = z
  .object({
    title: workExperienceFields.title.optional(),
    companyName: workExperienceFields.companyName.optional(),
    employmentType: workExperienceFields.employmentType,
    workModel: workExperienceFields.workModel,
    locationCity: workExperienceFields.locationCity,
    locationState: workExperienceFields.locationState,
    locationCountry: workExperienceFields.locationCountry,
    startDate: workExperienceFields.startDate,
    endDate: workExperienceFields.endDate,
    isCurrent: workExperienceFields.isCurrent,
    description: workExperienceFields.description,
    mainStack: workExperienceFields.mainStack,
  })
  .superRefine(refineWorkDates);

export type WorkExperienceResponse = z.infer<typeof workExperienceSchema>;
export type PublicWorkExperienceResponse = z.infer<
  typeof publicWorkExperienceSchema
>;
export type CreateWorkExperienceInput = z.input<
  typeof createWorkExperienceInputSchema
>;
export type UpdateWorkExperienceInput = z.input<
  typeof updateWorkExperienceInputSchema
>;
export type EmploymentType = z.infer<typeof employmentTypeSchema>;
