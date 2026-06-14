import type {
  ApplyAiResumeImportInput,
  CreateWorkExperienceInput,
  ParsedResumeData,
  ResumeResponse,
} from "@repo/schemas";

export type ResumeScalarField =
  | "headlineTitle"
  | "summary"
  | "totalYearsExperience"
  | "location"
  | "seniorityLevel"
  | "workModel"
  | "contractType"
  | "salaryExpectationMin"
  | "salaryExpectationMax"
  | "noticePeriod";

export const RESUME_SCALAR_FIELDS: {
  key: ResumeScalarField;
  label: string;
}[] = [
  { key: "headlineTitle", label: "Headline" },
  { key: "summary", label: "Summary" },
  { key: "totalYearsExperience", label: "Years of experience" },
  { key: "location", label: "Location" },
  { key: "seniorityLevel", label: "Seniority" },
  { key: "workModel", label: "Work model" },
  { key: "contractType", label: "Contract type" },
  { key: "salaryExpectationMin", label: "Salary expectation (min)" },
  { key: "salaryExpectationMax", label: "Salary expectation (max)" },
  { key: "noticePeriod", label: "Notice period" },
];

export function parsedValueFor(
  parsed: ParsedResumeData,
  field: ResumeScalarField,
): string | number | null {
  const value = parsed[field];
  return value === undefined ? null : (value ?? null);
}

/** A resume scalar field counts as "empty" when there is no saved value yet. */
export function isResumeFieldEmpty(
  resume: ResumeResponse | null,
  field: ResumeScalarField,
): boolean {
  if (!resume) {
    return true;
  }
  const value = resume[field];
  return value === null || value === undefined || value === "";
}

export function parsedWorkToInput(
  entry: NonNullable<ParsedResumeData["workExperiences"]>[number],
): CreateWorkExperienceInput {
  return {
    title: entry.title,
    companyName: entry.companyName,
    employmentType: entry.employmentType ?? null,
    workModel: entry.workModel ?? null,
    locationCity: entry.locationCity ?? null,
    locationState: entry.locationState ?? null,
    locationCountry: entry.locationCountry ?? null,
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    isCurrent: entry.isCurrent ?? false,
    description: entry.description ?? null,
    mainStack: entry.mainStack ?? [],
  };
}

export type ImportSelection = {
  resumeFields: Set<ResumeScalarField>;
  includeLanguages: boolean;
  includeProfileName: boolean;
  includeProfileDescription: boolean;
  skills: Set<string>;
  titles: Set<string>;
  workIndexes: Set<number>;
};

export function buildApplyPayload(
  parsed: ParsedResumeData,
  selection: ImportSelection,
): ApplyAiResumeImportInput {
  const resume: NonNullable<ApplyAiResumeImportInput["resume"]> = {};

  for (const field of selection.resumeFields) {
    const value = parsedValueFor(parsed, field);
    if (value !== null) {
      // @ts-expect-error indexed assignment across a heterogeneous field set
      resume[field] = value;
    }
  }

  if (
    selection.includeLanguages &&
    parsed.spokenLanguages &&
    parsed.spokenLanguages.length > 0
  ) {
    resume.spokenLanguages = parsed.spokenLanguages;
  }

  const workExperiences = (parsed.workExperiences ?? [])
    .filter((_, index) => selection.workIndexes.has(index))
    .map(parsedWorkToInput);

  const payload: ApplyAiResumeImportInput = {};

  if (Object.keys(resume).length > 0) {
    payload.resume = resume;
  }

  if (selection.skills.size > 0) {
    payload.skills = Array.from(selection.skills);
  }

  if (selection.titles.size > 0) {
    payload.titles = Array.from(selection.titles);
  }

  if (workExperiences.length > 0) {
    payload.workExperiences = workExperiences;
  }

  if (selection.includeProfileName && parsed.profileName) {
    payload.profileName = parsed.profileName;
  }

  if (selection.includeProfileDescription && parsed.profileDescription) {
    payload.profileDescription = parsed.profileDescription;
  }

  return payload;
}
