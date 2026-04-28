import { z } from "zod/v4";
import type { RecruiterSearchResponse } from "../../../lib/auth-api";

export const DEFAULT_TOP_K = 50;

export const CONTRACT_TYPE_OPTIONS = [
  "clt",
  "pj",
  "freelance",
  "contract",
  "full-time",
  "part-time",
] as const;

export const SENIORITY_OPTIONS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
] as const;

export const WORK_MODEL_OPTIONS = ["remote", "hybrid", "on-site"] as const;

export type SelectOption = {
  value: string;
  label: string;
};

export const OPEN_TO_RELOCATION_OPTIONS: SelectOption[] = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: "English", label: "English" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Mandarin", label: "Mandarin" },
  { value: "Japanese", label: "Japanese" },
];

export const LOCATION_OPTIONS: SelectOption[] = [
  { value: "Remote", label: "Remote" },
  { value: "Sao Paulo", label: "Sao Paulo" },
  { value: "Rio de Janeiro", label: "Rio de Janeiro" },
  { value: "Lisbon", label: "Lisbon" },
  { value: "Porto", label: "Porto" },
  { value: "Madrid", label: "Madrid" },
  { value: "London", label: "London" },
  { value: "Berlin", label: "Berlin" },
];

export const NOTICE_PERIOD_OPTIONS: SelectOption[] = [
  { value: "Immediate", label: "Immediate" },
  { value: "15 days", label: "15 days" },
  { value: "30 days", label: "30 days" },
  { value: "45 days", label: "45 days" },
  { value: "60 days", label: "60 days" },
];

export const SKILL_OPTIONS: SelectOption[] = [
  { value: "Node.js", label: "Node.js" },
  { value: "TypeScript", label: "TypeScript" },
  { value: "React", label: "React" },
  { value: "PostgreSQL", label: "PostgreSQL" },
  { value: "Python", label: "Python" },
  { value: "Java", label: "Java" },
  { value: "AWS", label: "AWS" },
  { value: "Docker", label: "Docker" },
  { value: "Kubernetes", label: "Kubernetes" },
];

export const TITLE_OPTIONS: SelectOption[] = [
  { value: "Software Engineer", label: "Software Engineer" },
  { value: "Backend Engineer", label: "Backend Engineer" },
  { value: "Frontend Engineer", label: "Frontend Engineer" },
  { value: "Fullstack Engineer", label: "Fullstack Engineer" },
  { value: "Tech Lead", label: "Tech Lead" },
  { value: "Engineering Manager", label: "Engineering Manager" },
  { value: "DevOps Engineer", label: "DevOps Engineer" },
  { value: "Data Engineer", label: "Data Engineer" },
];

export type ContractType = (typeof CONTRACT_TYPE_OPTIONS)[number];
export type SeniorityLevel = (typeof SENIORITY_OPTIONS)[number];
export type WorkModel = (typeof WORK_MODEL_OPTIONS)[number];

export type RankedCandidate = RecruiterSearchResponse["candidates"][number] & {
  aiScore: number;
};

export const selectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const optionalNumericStringSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+$/.test(value), {
    message: "Use only non-negative whole numbers",
  });

export const advancedSearchFormSchema = z
  .object({
    chatPrompt: z.string(),
    semanticSkills: z.array(selectOptionSchema),
    semanticTitles: z.array(selectOptionSchema),
    contractTypes: z.array(selectOptionSchema),
    seniorityLevels: z.array(selectOptionSchema),
    workModels: z.array(selectOptionSchema),
    openToRelocation: selectOptionSchema,
    minYearsExperience: optionalNumericStringSchema,
    maxYearsExperience: optionalNumericStringSchema,
    locations: z.array(selectOptionSchema),
    spokenLanguages: z.array(selectOptionSchema),
    noticePeriods: z.array(selectOptionSchema),
    mandatorySkills: z.array(selectOptionSchema),
    mandatoryTitles: z.array(selectOptionSchema),
    minSalary: optionalNumericStringSchema,
    maxSalary: optionalNumericStringSchema,
    nameContains: z.string(),
    usernameContains: z.string(),
    profileTextContains: z.string(),
  })
  .superRefine((value, context) => {
    const minYears = Number(value.minYearsExperience || 0);
    const maxYears = Number(value.maxYearsExperience || 0);

    if (
      value.minYearsExperience &&
      value.maxYearsExperience &&
      minYears > maxYears
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Min years must be lower or equal to max years",
        path: ["maxYearsExperience"],
      });
    }

    const minSalary = Number(value.minSalary || 0);
    const maxSalary = Number(value.maxSalary || 0);

    if (value.minSalary && value.maxSalary && minSalary > maxSalary) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Min salary must be lower or equal to max salary",
        path: ["maxSalary"],
      });
    }
  });

export type AdvancedSearchFormValues = z.infer<typeof advancedSearchFormSchema>;
