import { z } from "zod/v4";

export const PREPROCESSING_VERSION = "v1" as const;

export const seniorityCategories = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
] as const;

export interface CandidateFeaturesInput {
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  location: string | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  skills: string[];
  titles: string[];
}

export interface QueryCandidateFeaturesInput {
  queryText: string;
  candidate: CandidateFeaturesInput;
}

export const preprocessingConfigSchema = z.object({
  version: z.string(),
  maxYearsExperience: z.number().positive(),
  maxSalaryExpectation: z.number().positive(),
  maxLanguageCount: z.number().positive(),
  knownLocations: z.array(z.string().min(1)),
  knownSkills: z.array(z.string().min(1)),
  knownTitles: z.array(z.string().min(1)),
  knownLanguages: z.array(z.string().min(1)),
  knownNoticePeriods: z.array(z.string().min(1)),
  seniorityCategories: z.array(z.string().min(1)),
  workModelCategories: z.array(z.string().min(1)),
  contractTypeCategories: z.array(z.string().min(1)),
});

export type PreprocessingConfig = z.infer<typeof preprocessingConfigSchema>;

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function toCandidateFeatureVector(
  input: CandidateFeaturesInput,
  config: PreprocessingConfig,
): number[] {
  const headlineSignal = input.headlineTitle?.trim().length ? 1 : 0;
  const summarySignal = input.summary?.trim().length ? 1 : 0;

  const safeYears = Math.max(0, input.totalYearsExperience ?? 0);
  const normalizedYears = Math.min(safeYears / config.maxYearsExperience, 1);

  const salaryMin = Math.max(0, input.salaryExpectationMin ?? 0);
  const salaryMax = Math.max(0, input.salaryExpectationMax ?? 0);
  const normalizedSalaryMin = Math.min(
    salaryMin / config.maxSalaryExpectation,
    1,
  );
  const normalizedSalaryMax = Math.min(
    salaryMax / config.maxSalaryExpectation,
    1,
  );

  const languageCount = Math.min(
    input.spokenLanguages.length / config.maxLanguageCount,
    1,
  );

  const seniorityVector = config.seniorityCategories.map((item) =>
    normalizeToken(item) === normalizeToken(input.seniorityLevel ?? "") ? 1 : 0,
  );

  const workModelVector = config.workModelCategories.map((item) =>
    normalizeToken(item) === normalizeToken(input.workModel ?? "") ? 1 : 0,
  );

  const contractTypeVector = config.contractTypeCategories.map((item) =>
    normalizeToken(item) === normalizeToken(input.contractType ?? "") ? 1 : 0,
  );

  const locationVector = config.knownLocations.map((item) =>
    normalizeToken(item) === normalizeToken(input.location ?? "") ? 1 : 0,
  );

  const noticePeriodVector = config.knownNoticePeriods.map((item) =>
    normalizeToken(item) === normalizeToken(input.noticePeriod ?? "") ? 1 : 0,
  );

  const skillSet = new Set(input.skills.map(normalizeToken));
  const skillVector = config.knownSkills.map((item) =>
    skillSet.has(normalizeToken(item)) ? 3 : 0,
  );

  const titleSet = new Set(input.titles.map(normalizeToken));
  const titleVector = config.knownTitles.map((item) =>
    titleSet.has(normalizeToken(item)) ? 2 : 0,
  );

  const languageSet = new Set(input.spokenLanguages.map(normalizeToken));
  const languageVector = config.knownLanguages.map((item) =>
    languageSet.has(normalizeToken(item)) ? 1 : 0,
  );

  return [
    headlineSignal,
    summarySignal,
    normalizedYears,
    normalizedSalaryMin,
    normalizedSalaryMax,
    languageCount,
    input.openToRelocation ? 1 : 0,
    ...seniorityVector,
    ...workModelVector,
    ...contractTypeVector,
    ...locationVector,
    ...noticePeriodVector,
    ...languageVector,
    ...skillVector,
    ...titleVector,
  ];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function overlapScore(expected: string[], actual: string[]): number {
  if (expected.length === 0) {
    return 0;
  }

  const expectedSet = new Set(expected.map(normalizeToken));
  const actualSet = new Set(actual.map(normalizeToken));

  if (expectedSet.size === 0) {
    return 0;
  }

  const matches = [...expectedSet].filter((item) => actualSet.has(item));
  return matches.length / expectedSet.size;
}

function scoreYearsHint(
  queryText: string,
  totalYearsExperience: number | null,
): number {
  const yearsHint = queryText
    .toLowerCase()
    .match(/(\d{1,2})\s*(\+)?\s*(years|year|yrs|ano|anos)/);

  if (!yearsHint || totalYearsExperience === null) {
    return 0;
  }

  const hintedYears = Number(yearsHint[1]);
  if (!Number.isFinite(hintedYears)) {
    return 0;
  }

  const gap = Math.abs(totalYearsExperience - hintedYears);
  return Math.max(0, 1 - gap / 12);
}

export function toQueryCandidateFeatureVector(
  input: QueryCandidateFeaturesInput,
  config: PreprocessingConfig,
): number[] {
  const candidateVector = toCandidateFeatureVector(input.candidate, config);

  const queryTokens = tokenize(input.queryText);
  const queryTokenSet = new Set(queryTokens.map(normalizeToken));
  const queryKnownSkills = config.knownSkills.filter((skill) =>
    queryTokenSet.has(normalizeToken(skill)),
  );
  const queryKnownTitles = config.knownTitles.filter((title) =>
    queryTokenSet.has(normalizeToken(title)),
  );

  const candidateTextTokens = tokenize(
    [
      input.candidate.headlineTitle,
      input.candidate.summary,
      input.candidate.location,
      input.candidate.seniorityLevel,
      input.candidate.workModel,
      input.candidate.contractType,
      input.candidate.noticePeriod,
      input.candidate.skills.join(" "),
      input.candidate.titles.join(" "),
      input.candidate.spokenLanguages.join(" "),
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(" "),
  );

  const queryTokenCoverage = overlapScore(queryTokens, candidateTextTokens);
  const querySkillCoverage = overlapScore(
    queryKnownSkills,
    input.candidate.skills,
  );
  const queryTitleCoverage = overlapScore(
    queryKnownTitles,
    input.candidate.titles,
  );
  const locationMentionScore = input.candidate.location
    ? queryTokenSet.has(normalizeToken(input.candidate.location))
      ? 1
      : 0
    : 0;
  const languageMentionScore = overlapScore(
    input.candidate.spokenLanguages,
    queryTokens,
  );
  const yearsHintScore = scoreYearsHint(
    input.queryText,
    input.candidate.totalYearsExperience,
  );
  const normalizedQueryLength = Math.min(queryTokens.length / 80, 1);

  return [
    ...candidateVector,
    queryTokenCoverage,
    querySkillCoverage,
    queryTitleCoverage,
    locationMentionScore,
    languageMentionScore,
    yearsHintScore,
    normalizedQueryLength,
  ];
}

export function buildDefaultPreprocessingConfig(
  knownLocations: string[],
  knownSkills: string[],
  knownTitles: string[],
  knownLanguages: string[],
  knownNoticePeriods: string[],
): PreprocessingConfig {
  const uniqueLocations = Array.from(
    new Set(knownLocations.map(normalizeToken)),
  ).slice(0, 40);
  const uniqueSkills = Array.from(
    new Set(knownSkills.map(normalizeToken)),
  ).slice(0, 160);
  const uniqueTitles = Array.from(
    new Set(knownTitles.map(normalizeToken)),
  ).slice(0, 80);
  const uniqueLanguages = Array.from(
    new Set(knownLanguages.map(normalizeToken)),
  ).slice(0, 20);
  const uniqueNoticePeriods = Array.from(
    new Set(knownNoticePeriods.map(normalizeToken)),
  ).slice(0, 10);

  return {
    version: PREPROCESSING_VERSION,
    maxYearsExperience: 25,
    maxSalaryExpectation: 300000,
    maxLanguageCount: 6,
    knownLocations: uniqueLocations,
    knownSkills: uniqueSkills,
    knownTitles: uniqueTitles,
    knownLanguages: uniqueLanguages,
    knownNoticePeriods: uniqueNoticePeriods,
    seniorityCategories: [...seniorityCategories],
    workModelCategories: ["remote", "hybrid", "on-site"],
    contractTypeCategories: [
      "clt",
      "pj",
      "freelance",
      "contract",
      "full-time",
      "part-time",
    ],
  };
}
