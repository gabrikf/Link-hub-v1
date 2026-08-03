import { matchCoverage } from "@repo/schemas";
import {
  COMPANY_POOL,
  SYNTHETIC_STACKS,
  type TrainingBlueprint,
} from "./blueprints.js";
import type {
  PostTrainingRow,
  ResumeTrainingRow,
  WorkExperienceTrainingRow,
} from "./training-types.js";

type CandidateQuality = "perfect" | "strong" | "medium" | "weak";

// Mirrors MATCH_WEIGHTS in @repo/schemas: skills 4x, titles 2x, work history 2x,
// everything else 1x. The synthetic label below is the exact target the model
// learns, so the trained scores line up with the transparent match shown to
// recruiters.
const MATCH_WEIGHTS = {
  skills: 4,
  titles: 2,
  workHistory: 2,
  others: 1,
} as const;

const QUALITY_DISTRIBUTION: CandidateQuality[] = [
  "perfect",
  "perfect",
  "strong",
  "strong",
  "medium",
  "weak",
];

/**
 * Share of generated rows that are same-blueprint quality variants (positive
 * signal). The remainder are cross-blueprint mismatches with label 0.
 *
 * The comment here used to claim 70/30 while the code did a hard 50/50. They
 * now agree, and the constant is the only place the ratio is written down.
 */
export const SYNTHETIC_POSITIVE_RATIO = 0.7;

/** Produces an integer in the inclusive [min, max] interval. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * The label the synthetic data is built from — now the same substring-aware
 * coverage the browser reranker shows and the same one the feature encoder uses.
 *
 * It used to be Jaccard (`|∩| / |∪|`), while the runtime blended the model's
 * output with a coverage score. The model was therefore trained to answer one
 * question and averaged at serve time with the answer to another.
 */
export const setSimilarity = matchCoverage;

/** Converts an absolute gap into a similarity score in the [0, 1] interval. */
function proximityScore(
  expected: number,
  actual: number,
  tolerance: number,
): number {
  if (tolerance <= 0) {
    return expected === actual ? 1 : 0;
  }

  const gap = Math.abs(expected - actual);
  return Math.max(0, 1 - gap / tolerance);
}

/**
 * Collapses a candidate's work history into the two sets that matter for
 * matching: every technology used across roles, and every role title held.
 */
function collectWorkHistorySignals(
  workExperiences: WorkExperienceTrainingRow[],
): { stack: string[]; titles: string[] } {
  const stack = new Set<string>();
  const titles = new Set<string>();

  for (const experience of workExperiences) {
    for (const tech of experience.mainStack) {
      stack.add(tech);
    }
    if (experience.title) {
      titles.add(experience.title);
    }
  }

  return { stack: [...stack], titles: [...titles] };
}

/**
 * How well a candidate's *real job history* covers what the role needs. Uses
 * the same stack/title comparison the recruiter cares about; no history → 0.
 */
function workHistoryScore(
  blueprint: TrainingBlueprint,
  workExperiences: WorkExperienceTrainingRow[],
): number {
  if (workExperiences.length === 0) {
    return 0;
  }

  const { stack, titles } = collectWorkHistorySignals(workExperiences);
  const stackScore = setSimilarity(blueprint.skills, stack);
  const titleScore = setSimilarity(blueprint.titles, titles);
  return (stackScore + titleScore) / 2;
}

/**
 * Computes a weighted target score: skills=4x, titles=2x, work history=2x and
 * other signals=1x — the single source of truth shared with the runtime.
 */
export function computeWeightedTarget(
  blueprint: TrainingBlueprint,
  candidate: ResumeTrainingRow,
): number {
  const skillScore = setSimilarity(blueprint.skills, candidate.skills);
  const titleScore = setSimilarity(blueprint.titles, candidate.titles);
  const workScore = workHistoryScore(blueprint, candidate.workExperiences);
  const languageScore = setSimilarity(
    blueprint.spokenLanguages,
    candidate.spokenLanguages,
  );

  const yearsCenter = (blueprint.minYears + blueprint.maxYears) / 2;
  const yearsScore = proximityScore(
    yearsCenter,
    candidate.totalYearsExperience ?? 0,
    Math.max(3, blueprint.maxYears - blueprint.minYears),
  );

  const salaryCenter =
    (blueprint.salaryExpectationMin + blueprint.salaryExpectationMax) / 2;
  const candidateSalaryCenter =
    ((candidate.salaryExpectationMin ?? 0) +
      (candidate.salaryExpectationMax ?? 0)) /
    2;
  const salaryScore = proximityScore(salaryCenter, candidateSalaryCenter, 90000);

  const categoricalSignals = [
    candidate.seniorityLevel === blueprint.seniorityLevel ? 1 : 0,
    candidate.workModel === blueprint.workModel ? 1 : 0,
    candidate.contractType === blueprint.contractType ? 1 : 0,
    candidate.location === blueprint.location ? 1 : 0,
    candidate.noticePeriod === blueprint.noticePeriod ? 1 : 0,
    candidate.openToRelocation === blueprint.openToRelocation ? 1 : 0,
    candidate.headlineTitle?.trim().length ? 1 : 0,
    candidate.summary?.trim().length ? 1 : 0,
    languageScore,
    yearsScore,
    salaryScore,
  ];

  const othersScore =
    categoricalSignals.reduce((sum, value) => sum + value, 0) /
    categoricalSignals.length;

  const totalWeight =
    MATCH_WEIGHTS.skills +
    MATCH_WEIGHTS.titles +
    MATCH_WEIGHTS.workHistory +
    MATCH_WEIGHTS.others;

  return (
    (MATCH_WEIGHTS.skills * skillScore +
      MATCH_WEIGHTS.titles * titleScore +
      MATCH_WEIGHTS.workHistory * workScore +
      MATCH_WEIGHTS.others * othersScore) /
    totalWeight
  );
}

/**
 * Builds believable work history for a synthetic candidate from the role's stack
 * and titles. Higher-quality candidates get more roles, richer stacks and real
 * accomplishment text; weak candidates get a thin, generic history.
 */
function buildSyntheticWorkExperiences(
  blueprint: TrainingBlueprint,
  quality: CandidateQuality,
  stack: readonly string[],
  titles: readonly string[],
  index: number,
): WorkExperienceTrainingRow[] {
  const roleCount = pickRoleCount(quality);

  if (roleCount === 0 || stack.length === 0) {
    return [];
  }

  const stackShare =
    quality === "perfect"
      ? stack.length
      : quality === "strong"
        ? Math.max(2, stack.length - 1)
        : Math.max(1, Math.floor(stack.length / 2));

  const experiences: WorkExperienceTrainingRow[] = [];
  for (let roleIndex = 0; roleIndex < roleCount; roleIndex += 1) {
    const company =
      COMPANY_POOL[(index + roleIndex) % COMPANY_POOL.length] ?? "TechCorp";
    const roleStack = [...stack].slice(0, stackShare);
    const roleTitle =
      titles[roleIndex % Math.max(1, titles.length)] ?? blueprint.headline;
    const description =
      quality === "weak"
        ? `Contributed to projects at ${company}.`
        : `Led ${roleTitle} work at ${company}, shipping features with ${roleStack.join(", ")} and driving measurable impact on reliability and delivery speed.`;

    experiences.push({
      title: roleTitle,
      companyName: company,
      description,
      mainStack: roleStack,
    });
  }

  return experiences;
}

function pickRoleCount(quality: CandidateQuality): number {
  if (quality === "perfect") return 3;
  if (quality === "strong") return 2;
  if (quality === "medium") return 1;
  return Math.random() < 0.5 ? 1 : 0;
}

/**
 * Published posts for a synthetic candidate.
 *
 * Post features are only learnable if the generated data varies along them, so
 * quality drives all three axes the encoder reads: how many posts there are, how
 * many are commit-sourced (the least gameable evidence) and how recent they are.
 */
function buildSyntheticPosts(
  blueprint: TrainingBlueprint,
  quality: CandidateQuality,
  stack: readonly string[],
  now: number,
): PostTrainingRow[] {
  const plan = {
    perfect: { count: 3, commitCount: 2, ageDays: 20 },
    strong: { count: 2, commitCount: 1, ageDays: 60 },
    medium: { count: 1, commitCount: 0, ageDays: 200 },
    weak: { count: 0, commitCount: 0, ageDays: 400 },
  }[quality];

  const posts: PostTrainingRow[] = [];
  for (let index = 0; index < plan.count; index += 1) {
    const focus = stack[index % Math.max(1, stack.length)] ?? blueprint.headline;
    const tags = [...blueprint.postTags].slice(0, 2 + (index % 2));
    posts.push({
      title: `Shipping ${focus} in production`,
      excerpt: `Notes from building with ${tags.join(", ")} — what broke, what we measured and what we changed.`,
      source: index < plan.commitCount ? "commit" : "manual",
      tags,
      publishedAt: new Date(
        now - (plan.ageDays + index * 15) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }

  return posts;
}

/** Creates realistic candidate variations from a role blueprint. */
export function createCandidateFromBlueprint(
  blueprint: TrainingBlueprint,
  quality: CandidateQuality,
  index: number,
  now: number = Date.now(),
): ResumeTrainingRow {
  const shuffledSkills = [...blueprint.skills].sort(() => Math.random() - 0.5);
  const shuffledTitles = [...blueprint.titles].sort(() => Math.random() - 0.5);

  let selectedSkills = [...blueprint.skills];
  let selectedTitles = [...blueprint.titles];
  let years = randomInt(blueprint.minYears, blueprint.maxYears);
  let salaryMin = blueprint.salaryExpectationMin;
  let salaryMax = blueprint.salaryExpectationMax;
  let location = blueprint.location;
  let workModel = blueprint.workModel;
  let spokenLanguages = [...blueprint.spokenLanguages];

  if (quality === "strong") {
    selectedSkills = shuffledSkills.slice(
      0,
      Math.max(3, blueprint.skills.length - 1),
    );
    selectedTitles = shuffledTitles.slice(
      0,
      Math.max(1, blueprint.titles.length),
    );
    years = Math.max(0, years - 1);
    salaryMax = Math.max(salaryMin + 10000, salaryMax - 8000);
  }

  if (quality === "medium") {
    selectedSkills = shuffledSkills.slice(
      0,
      Math.max(2, Math.floor(blueprint.skills.length / 2)),
    );
    selectedTitles = shuffledTitles.slice(0, 1);
    years = Math.max(0, years - randomInt(1, 3));
    salaryMin = Math.max(0, salaryMin - 15000);
    salaryMax = Math.max(salaryMin + 12000, salaryMax - 22000);
    workModel = blueprint.workModel === "remote" ? "hybrid" : "remote";
    spokenLanguages = spokenLanguages.slice(
      0,
      Math.max(1, spokenLanguages.length - 1),
    );
  }

  if (quality === "weak") {
    selectedSkills = shuffledSkills.slice(
      0,
      Math.max(1, Math.floor(blueprint.skills.length / 3)),
    );
    selectedTitles = shuffledTitles.slice(0, 1);
    years = Math.max(0, years - randomInt(2, 6));
    salaryMin = Math.max(0, salaryMin - 30000);
    salaryMax = Math.max(salaryMin + 10000, salaryMax - 45000);
    location = "remote";
    workModel = "on-site";
    spokenLanguages = [blueprint.spokenLanguages[0] ?? "english"];
  }

  const workExperiences = buildSyntheticWorkExperiences(
    blueprint,
    quality,
    selectedSkills,
    selectedTitles,
    index,
  );

  const row: ResumeTrainingRow = {
    resumeId: `synthetic-${quality}-${index + 1}`,
    queryText: [
      `Role: ${blueprint.titles[0] ?? blueprint.headline}`,
      `Seniority: ${blueprint.seniorityLevel}`,
      `Core Skills: ${blueprint.skills.join(", ")}`,
      `Titles: ${blueprint.titles.join(", ")}`,
      `Location: ${blueprint.location}`,
      `Work Model: ${blueprint.workModel}`,
      `Experience: ${blueprint.minYears}+ years`,
    ].join("\n"),
    headlineTitle:
      quality === "weak" ? "Generalist Software Developer" : blueprint.headline,
    summary:
      quality === "weak"
        ? "Works across varied products with broad exposure."
        : blueprint.summary,
    totalYearsExperience: years,
    seniorityLevel: quality === "weak" ? "mid" : blueprint.seniorityLevel,
    workModel,
    contractType: blueprint.contractType,
    location,
    spokenLanguages,
    noticePeriod: blueprint.noticePeriod,
    openToRelocation: blueprint.openToRelocation,
    salaryExpectationMin: salaryMin,
    salaryExpectationMax: salaryMax,
    skills: selectedSkills,
    titles: selectedTitles,
    workExperiences,
    posts: buildSyntheticPosts(blueprint, quality, selectedSkills, now),
    interactionScore: 0,
    isSynthetic: true,
  };

  // Stores the synthetic label in interactionScore and keeps the existing label
  // pipeline unchanged.
  row.interactionScore = Math.min(2, computeWeightedTarget(blueprint, row) * 2);
  return row;
}

/** Generates synthetic supervised examples across the quality distribution. */
export function createSyntheticDataset(
  count: number,
  now: number = Date.now(),
): ResumeTrainingRow[] {
  const rows: ResumeTrainingRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const blueprint = SYNTHETIC_STACKS[index % SYNTHETIC_STACKS.length]!;
    const quality = QUALITY_DISTRIBUTION[index % QUALITY_DISTRIBUTION.length]!;
    rows.push(createCandidateFromBlueprint(blueprint, quality, index, now));
  }

  return rows;
}

/**
 * Cross-blueprint negatives: a query from blueprint A paired with a candidate
 * from a distant blueprint B (guaranteed skill mismatch). These label=0 examples
 * are the only thing teaching the model what a bad match looks like.
 */
export function createCrossBlueprintNegatives(
  count: number,
  now: number = Date.now(),
): ResumeTrainingRow[] {
  const rows: ResumeTrainingRow[] = [];
  const n = SYNTHETIC_STACKS.length;
  const halfN = Math.floor(n / 2);

  for (let index = 0; index < count; index += 1) {
    const queryBlueprintIdx = index % n;
    // Pick a candidate blueprint from the "opposite" half of the stack to
    // maximise the chance of zero skill-title overlap.
    const candidateBlueprintIdx = (queryBlueprintIdx + halfN) % n;
    const queryBlueprint = SYNTHETIC_STACKS[queryBlueprintIdx]!;
    const candidateBlueprint = SYNTHETIC_STACKS[candidateBlueprintIdx]!;

    const years = randomInt(
      candidateBlueprint.minYears,
      candidateBlueprint.maxYears,
    );

    rows.push({
      resumeId: `synthetic-negative-${index + 1}`,
      queryText: [
        `Role: ${queryBlueprint.titles[0] ?? queryBlueprint.headline}`,
        `Seniority: ${queryBlueprint.seniorityLevel}`,
        `Core Skills: ${queryBlueprint.skills.join(", ")}`,
        `Titles: ${queryBlueprint.titles.join(", ")}`,
        `Work Model: ${queryBlueprint.workModel}`,
        `Experience: ${queryBlueprint.minYears}+ years`,
      ].join("\n"),
      headlineTitle: candidateBlueprint.headline,
      summary: candidateBlueprint.summary,
      totalYearsExperience: years,
      seniorityLevel: candidateBlueprint.seniorityLevel,
      workModel: candidateBlueprint.workModel,
      contractType: candidateBlueprint.contractType,
      location: candidateBlueprint.location,
      spokenLanguages: [...candidateBlueprint.spokenLanguages],
      noticePeriod: candidateBlueprint.noticePeriod,
      openToRelocation: candidateBlueprint.openToRelocation,
      salaryExpectationMin: candidateBlueprint.salaryExpectationMin,
      salaryExpectationMax: candidateBlueprint.salaryExpectationMax,
      skills: [...candidateBlueprint.skills],
      titles: [...candidateBlueprint.titles],
      // Work history and posts from the *mismatched* candidate blueprint: a
      // strong, well-documented track record in the wrong stack must still
      // score 0 against this query.
      workExperiences: buildSyntheticWorkExperiences(
        candidateBlueprint,
        "strong",
        candidateBlueprint.skills,
        candidateBlueprint.titles,
        index,
      ),
      posts: buildSyntheticPosts(
        candidateBlueprint,
        "strong",
        candidateBlueprint.skills,
        now,
      ),
      interactionScore: 0, // label = 0: query and candidate are a clear mismatch
      isSynthetic: true,
    });
  }

  return rows;
}

export interface SyntheticEnrichmentOptions {
  /** Floor on generated rows, so a cold start still has enough supervision. */
  minimumSynthetic: number;
  /** Generated rows per real row, on top of the floor. */
  ratioToReal: number;
  now?: number;
}

/**
 * Adds synthetic supervision on top of the real data.
 *
 * The count is additive — a floor plus a ratio of the real dataset — and NOT
 * `target - realCount`. Under the old formula the synthetic count hit zero at
 * 720 real rows and the function returned early, so past that point every
 * label-0 example in the entire dataset disappeared at once and the model
 * collapsed to predicting 1.0 for everybody. Nothing about the data changed on
 * row 721; the arithmetic did.
 */
export function enrichDatasetWithSyntheticRows(
  dataset: readonly ResumeTrainingRow[],
  options: SyntheticEnrichmentOptions,
): ResumeTrainingRow[] {
  const now = options.now ?? Date.now();
  const syntheticCount = Math.max(
    options.minimumSynthetic,
    Math.ceil(dataset.length * options.ratioToReal),
  );

  const positiveCount = Math.round(syntheticCount * SYNTHETIC_POSITIVE_RATIO);
  const negativeCount = syntheticCount - positiveCount;

  return [
    ...dataset,
    ...createSyntheticDataset(positiveCount, now),
    ...createCrossBlueprintNegatives(negativeCount, now),
  ];
}
