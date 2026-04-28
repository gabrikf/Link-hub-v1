import type { RecruiterSearchInput } from "@repo/schemas";
import type {
  AdvancedSearchFormValues,
  ContractType,
  SelectOption,
  SeniorityLevel,
  WorkModel,
} from "../types/advanced-search";
import {
  CONTRACT_TYPE_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_MODEL_OPTIONS,
} from "../types/advanced-search";

export function toUniqueTrimmedValues(options: SelectOption[]): string[] {
  return Array.from(
    new Set(
      options
        .map((item) => item.value.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export function parseOptionalNumber(input: string): number | undefined {
  if (!input.trim()) {
    return undefined;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed);
}

export function formatAiMatchPercent(aiScore: number): string {
  const normalizedScore = aiScore <= 1 ? aiScore * 100 : aiScore;
  const clampedScore = Math.max(0, Math.min(100, normalizedScore));

  return `${Math.round(clampedScore)}%`;
}

export type BuildSearchPayloadInput = {
  values: AdvancedSearchFormValues;
  attachmentFile: File | null;
  topK: number;
};

export function buildRecruiterSearchPayload({
  values,
  attachmentFile,
  topK,
}: BuildSearchPayloadInput): {
  payload: RecruiterSearchInput & { attachmentFile?: File };
  hasSemanticInput: boolean;
} {
  const backendContractTypes = values.contractTypes
    .map((item) => item.value)
    .filter((item): item is ContractType =>
      CONTRACT_TYPE_OPTIONS.includes(item as ContractType),
    );

  const backendSeniorityLevels = values.seniorityLevels
    .map((item) => item.value)
    .filter((item): item is SeniorityLevel =>
      SENIORITY_OPTIONS.includes(item as SeniorityLevel),
    );

  const backendWorkModels = values.workModels
    .map((item) => item.value)
    .filter((item): item is WorkModel =>
      WORK_MODEL_OPTIONS.includes(item as WorkModel),
    );

  const whereQuery: RecruiterSearchInput["whereQuery"] = {
    contractTypes:
      backendContractTypes.length > 0 ? backendContractTypes : undefined,
    seniorityLevels:
      backendSeniorityLevels.length > 0 ? backendSeniorityLevels : undefined,
    workModels: backendWorkModels.length > 0 ? backendWorkModels : undefined,
    openToRelocation:
      values.openToRelocation.value === "any"
        ? undefined
        : values.openToRelocation.value === "yes",
    minYearsExperience: parseOptionalNumber(values.minYearsExperience),
    maxYearsExperience: parseOptionalNumber(values.maxYearsExperience),
    locations: toUniqueTrimmedValues(values.locations),
    spokenLanguages: toUniqueTrimmedValues(values.spokenLanguages),
    noticePeriods: toUniqueTrimmedValues(values.noticePeriods),
    skills: toUniqueTrimmedValues(values.mandatorySkills),
    titles: toUniqueTrimmedValues(values.mandatoryTitles),
    minSalary: parseOptionalNumber(values.minSalary),
    maxSalary: parseOptionalNumber(values.maxSalary),
    nameContains: values.nameContains.trim() || undefined,
    usernameContains: values.usernameContains.trim() || undefined,
    profileTextContains: values.profileTextContains.trim() || undefined,
  };

  const semanticSkills = toUniqueTrimmedValues(values.semanticSkills);
  const semanticTitles = toUniqueTrimmedValues(values.semanticTitles);

  const chatPrompt = values.chatPrompt.trim();

  const hasAnyFilter =
    semanticSkills.length > 0 ||
    semanticTitles.length > 0 ||
    toUniqueTrimmedValues(values.mandatorySkills).length > 0 ||
    toUniqueTrimmedValues(values.mandatoryTitles).length > 0 ||
    backendContractTypes.length > 0 ||
    backendSeniorityLevels.length > 0 ||
    backendWorkModels.length > 0 ||
    toUniqueTrimmedValues(values.locations).length > 0 ||
    toUniqueTrimmedValues(values.spokenLanguages).length > 0 ||
    toUniqueTrimmedValues(values.noticePeriods).length > 0 ||
    parseOptionalNumber(values.minYearsExperience) !== undefined ||
    parseOptionalNumber(values.maxYearsExperience) !== undefined ||
    parseOptionalNumber(values.minSalary) !== undefined ||
    parseOptionalNumber(values.maxSalary) !== undefined ||
    values.nameContains.trim().length > 0 ||
    values.usernameContains.trim().length > 0 ||
    values.profileTextContains.trim().length > 0 ||
    values.openToRelocation.value !== "any";

  const hasSemanticInput =
    chatPrompt.length > 0 || Boolean(attachmentFile) || hasAnyFilter;

  return {
    hasSemanticInput,
    payload: {
      query: undefined,
      chatPrompt: chatPrompt || undefined,
      semanticSkills: semanticSkills.length > 0 ? semanticSkills : undefined,
      semanticTitles: semanticTitles.length > 0 ? semanticTitles : undefined,
      whereQuery,
      topK,
      attachmentFile: attachmentFile ?? undefined,
    },
  };
}
