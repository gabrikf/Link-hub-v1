import { z } from "zod/v4";

// Bumped to v2: the feature vector now encodes work history (the companies a
// candidate actually worked at, the roles they held, the stack they used and
// what they accomplished). Anything that consumes a persisted preprocessing.json
// should treat v1 and v2 as incompatible shapes.
export const PREPROCESSING_VERSION = "v2" as const;

/**
 * How much each signal is allowed to influence a match. These are the single
 * source of truth for the whole pipeline: the feature encoder below, the
 * training target in apps/training, and the worker's transparent fallback score
 * all use the exact same numbers. Keeping them here means "skills matter 4x"
 * is true everywhere, not just in one place.
 *
 *   skills      → strongest predictor of fit
 *   titles      → the role the candidate calls themselves
 *   workHistory → proof they actually did the work (stack + roles they held)
 *   base        → everything else (seniority, location, languages, logistics…)
 */
export const MATCH_WEIGHTS = {
  skills: 4,
  titles: 2,
  workHistory: 2,
  base: 1,
} as const;

export const seniorityCategories = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
] as const;

/**
 * A single past role, reduced to the only parts that help matching: the role
 * title, the company, what the candidate did there, and the technologies used.
 */
export interface WorkExperienceFeature {
  title: string | null;
  companyName: string | null;
  description: string | null;
  mainStack: string[];
}

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
  workExperiences: WorkExperienceFeature[];
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
  maxWorkExperienceCount: z.number().positive(),
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

// --- Work-history helpers ---------------------------------------------------
// A candidate proves a skill/title much more convincingly when it shows up in
// the actual jobs they held than when it's just self-declared. These pull the
// stack, role titles and free text out of the work history so we can reward it.

function workStackSet(experiences: WorkExperienceFeature[]): Set<string> {
  const set = new Set<string>();
  for (const experience of experiences) {
    for (const tech of experience.mainStack) {
      set.add(normalizeToken(tech));
    }
  }
  return set;
}

function workTitleSet(experiences: WorkExperienceFeature[]): Set<string> {
  const set = new Set<string>();
  for (const experience of experiences) {
    if (experience.title) {
      set.add(normalizeToken(experience.title));
    }
  }
  return set;
}

function workHistoryText(experiences: WorkExperienceFeature[]): string {
  return experiences
    .flatMap((experience) => [
      experience.title,
      experience.companyName,
      experience.description,
      experience.mainStack.join(" "),
    ])
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
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

  // Skills are encoded with the strongest weight (4). A skill that is also
  // backed by real work history gets an extra +2, so "I used React on the job"
  // outranks "I listed React" — exactly the work-history boost we want (2x).
  const declaredSkills = new Set(input.skills.map(normalizeToken));
  const stackSkills = workStackSet(input.workExperiences);
  const skillVector = config.knownSkills.map((item) => {
    const token = normalizeToken(item);
    return (
      (declaredSkills.has(token) ? MATCH_WEIGHTS.skills : 0) +
      (stackSkills.has(token) ? MATCH_WEIGHTS.workHistory : 0)
    );
  });

  // Titles weighted 2, with an extra +2 when the candidate actually held that
  // role in their work history.
  const declaredTitles = new Set(input.titles.map(normalizeToken));
  const heldTitles = workTitleSet(input.workExperiences);
  const titleVector = config.knownTitles.map((item) => {
    const token = normalizeToken(item);
    return (
      (declaredTitles.has(token) ? MATCH_WEIGHTS.titles : 0) +
      (heldTitles.has(token) ? MATCH_WEIGHTS.workHistory : 0)
    );
  });

  const languageSet = new Set(input.spokenLanguages.map(normalizeToken));
  const languageVector = config.knownLanguages.map((item) =>
    languageSet.has(normalizeToken(item)) ? 1 : 0,
  );

  // Two compact scalars that summarise "does this person have a real track
  // record": how many roles they've held and whether those roles are described.
  const workExperienceCount = Math.min(
    input.workExperiences.length / config.maxWorkExperienceCount,
    1,
  );
  const describedExperiences = input.workExperiences.filter((experience) =>
    experience.description?.trim().length ? true : false,
  ).length;
  const workHistoryDepth =
    input.workExperiences.length === 0
      ? 0
      : describedExperiences / input.workExperiences.length;

  return [
    headlineSignal,
    summarySignal,
    normalizedYears,
    normalizedSalaryMin,
    normalizedSalaryMax,
    languageCount,
    input.openToRelocation ? 1 : 0,
    workExperienceCount,
    workHistoryDepth,
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

  // Work-history coverage: does the candidate's *actual job history* cover what
  // the recruiter asked for? This is the decisive "really matches" signal — a
  // React/Node query against someone who shipped React/Node at real companies.
  const stackTokens = [...workStackSet(input.candidate.workExperiences)];
  const heldTitleTokens = [...workTitleSet(input.candidate.workExperiences)];
  const workTextTokens = tokenize(workHistoryText(input.candidate.workExperiences));

  const queryWorkStackCoverage = overlapScore(queryKnownSkills, stackTokens);
  const queryWorkTitleCoverage = overlapScore(queryKnownTitles, heldTitleTokens);
  const queryWorkTextCoverage = overlapScore(queryTokens, workTextTokens);

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
    queryWorkStackCoverage,
    queryWorkTitleCoverage,
    queryWorkTextCoverage,
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
    maxWorkExperienceCount: 6,
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
