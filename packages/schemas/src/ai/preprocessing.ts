import { z } from "zod/v4";
import {
  extractKnownTerms,
  matchCoverage,
  tokenizeMatchText,
} from "../matching/index.js";

// Bumped to v3: the feature vector now encodes published posts as evidence of
// shipped work (tag overlap with the query, post-text coverage, recency and how
// many of them came straight from commit history), and every set-overlap
// feature is computed with the shared substring-aware `matchCoverage` instead of
// a local exact-set comparison. v1 (125 features), v2 (130) and v3 are mutually
// incompatible shapes; `assertPreprocessingCompatible` below is what stops a
// stale config being paired with a newer model.
export const PREPROCESSING_VERSION = "v3" as const;

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

/**
 * A published post reduced to the parts that carry matching signal. This is the
 * same projection the search API returns as `workEvidence`.
 *
 * `source: "commit"` posts are written by the MCP server straight from the
 * candidate's commit history, which makes them the least gameable evidence in
 * the whole profile — hence their own feature below.
 */
export interface PostFeature {
  title: string | null;
  /** Post excerpt or body. Never needs to be the full text. */
  excerpt: string;
  /** "manual" | "mcp" | "agent" | "commit" — kept as a string so a new source doesn't break parsing. */
  source: string;
  tags: string[];
  publishedAt: Date | string | null;
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
  /**
   * Optional so every existing caller keeps compiling. A candidate with no
   * posts and a candidate whose posts were not loaded both encode as zeros —
   * which is correct: absence of evidence is what the feature measures.
   */
  posts?: PostFeature[];
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
  /**
   * Optional so a persisted v2 config still parses — it is only used by the v3
   * post features, and a config that lacks it is rejected by
   * `assertPreprocessingCompatible` on the version check anyway.
   */
  maxPostCount: z.number().positive().optional(),
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

/**
 * Thrown when a persisted `preprocessing.json` cannot be used with the model
 * sitting next to it.
 *
 * `preprocessingConfigSchema` declares `version: z.string()` and nothing ever
 * compared it to {@link PREPROCESSING_VERSION}, so a v1 config (125 features)
 * loaded beside a v2 model (130 inputs) parsed cleanly and then produced a
 * dimension mismatch deep inside TensorFlow — or worse, silently scored every
 * candidate through a permuted feature space. Named so callers can catch it and
 * fall back instead of guessing from a message string.
 */
export class PreprocessingCompatibilityError extends Error {
  readonly name = "PreprocessingCompatibilityError";
  readonly expectedVersion: string;
  readonly receivedVersion: string;
  readonly expectedInputDim?: number;
  readonly receivedInputDim?: number;

  constructor(details: {
    message: string;
    expectedVersion: string;
    receivedVersion: string;
    expectedInputDim?: number;
    receivedInputDim?: number;
  }) {
    super(details.message);
    this.expectedVersion = details.expectedVersion;
    this.receivedVersion = details.receivedVersion;
    this.expectedInputDim = details.expectedInputDim;
    this.receivedInputDim = details.receivedInputDim;
  }
}

/**
 * Gate a loaded config before anything is encoded with it.
 *
 * @param config          the parsed `preprocessing.json`
 * @param expectedInputDim the model's declared input width, when known. Passing
 *   it turns "the versions look right" into "the vectors will actually fit".
 */
export function assertPreprocessingCompatible(
  config: PreprocessingConfig,
  expectedInputDim?: number | null,
): void {
  if (config.version !== PREPROCESSING_VERSION) {
    throw new PreprocessingCompatibilityError({
      message: `Preprocessing config version "${config.version}" does not match the runtime version "${PREPROCESSING_VERSION}". The model artifacts need to be retrained or the deployment is serving a stale bundle.`,
      expectedVersion: PREPROCESSING_VERSION,
      receivedVersion: config.version,
    });
  }

  if (expectedInputDim === undefined || expectedInputDim === null) {
    return;
  }

  const configuredDim = preprocessingInputDimension(config);
  if (configuredDim !== expectedInputDim) {
    throw new PreprocessingCompatibilityError({
      message: `Preprocessing config produces ${configuredDim} features but the model expects ${expectedInputDim}.`,
      expectedVersion: PREPROCESSING_VERSION,
      receivedVersion: config.version,
      expectedInputDim,
      receivedInputDim: configuredDim,
    });
  }
}

/**
 * Width of the query-aware vector this config produces, derived from the
 * vocabulary sizes rather than by encoding a dummy candidate — so it stays
 * cheap enough to call on every model load.
 */
export function preprocessingInputDimension(
  config: PreprocessingConfig,
): number {
  return (
    CANDIDATE_SCALAR_FEATURE_COUNT +
    config.seniorityCategories.length +
    config.workModelCategories.length +
    config.contractTypeCategories.length +
    config.knownLocations.length +
    config.knownNoticePeriods.length +
    config.knownLanguages.length +
    config.knownSkills.length +
    config.knownTitles.length +
    QUERY_FEATURE_COUNT
  );
}

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

/**
 * Non-vocabulary scalars emitted by `toCandidateFeatureVector`, in order:
 * headline, summary, years, salary min, salary max, language count,
 * relocation, work-experience count, work-history depth, post count,
 * commit-post share, post recency.
 */
const CANDIDATE_SCALAR_FEATURE_COUNT = 12;

/** Extra features `toQueryCandidateFeatureVector` appends after the candidate block. */
const QUERY_FEATURE_COUNT = 12;

/** Posts older than this stop counting as "recent shipped work". */
const POST_RECENCY_HORIZON_DAYS = 540;

function postPublishedTime(post: PostFeature): number | null {
  if (!post.publishedAt) {
    return null;
  }

  const time =
    post.publishedAt instanceof Date
      ? post.publishedAt.getTime()
      : new Date(post.publishedAt).getTime();

  return Number.isFinite(time) ? time : null;
}

function postTagTokens(posts: PostFeature[]): string[] {
  return posts.flatMap((post) => post.tags);
}

function postText(posts: PostFeature[]): string {
  return posts
    .flatMap((post) => [post.title, post.excerpt, post.tags.join(" ")])
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

/**
 * 1 for a post published today, decaying linearly to 0 at
 * {@link POST_RECENCY_HORIZON_DAYS}. Uses the most recent post only: a
 * candidate who shipped last month is current regardless of how quiet the two
 * years before that were.
 *
 * `now` is injectable so the frozen fixture test can pin it — otherwise every
 * committed expectation would drift by a day, every day.
 */
function postRecencyScore(posts: PostFeature[], now: number): number {
  let newest: number | null = null;

  for (const post of posts) {
    const time = postPublishedTime(post);
    if (time !== null && (newest === null || time > newest)) {
      newest = time;
    }
  }

  if (newest === null) {
    return 0;
  }

  const ageDays = (now - newest) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) {
    return 1;
  }

  return Math.max(0, 1 - ageDays / POST_RECENCY_HORIZON_DAYS);
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

/**
 * Options shared by both encoders. `now` exists purely so time-dependent
 * features (post recency) are reproducible in tests and in a training run that
 * must encode the same row the same way twice.
 */
export interface FeatureEncodingOptions {
  now?: number;
}

export function toCandidateFeatureVector(
  input: CandidateFeaturesInput,
  config: PreprocessingConfig,
  options: FeatureEncodingOptions = {},
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

  // Published posts as proof of shipped work. Three scalars, in the order the
  // recruiter would ask about them: is there anything at all, how much of it is
  // machine-attested commit history, and is any of it recent.
  const posts = input.posts ?? [];
  const normalizedPostCount = Math.min(
    posts.length / (config.maxPostCount ?? DEFAULT_MAX_POST_COUNT),
    1,
  );
  const commitPostShare =
    posts.length === 0
      ? 0
      : posts.filter((post) => normalizeToken(post.source) === "commit")
          .length / posts.length;
  const postRecency = postRecencyScore(posts, options.now ?? Date.now());

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
    normalizedPostCount,
    commitPostShare,
    postRecency,
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

// `tokenize` and `overlapScore` used to live here as private copies. They are
// now the shared implementations in `../matching`, so the encoder, the training
// target and the browser reranker cannot drift apart again.
const tokenize = tokenizeMatchText;
const overlapScore = matchCoverage;

function scoreYearsHint(
  queryText: string,
  totalYearsExperience: number | null,
): number {
  const yearsHint = /(\d{1,2})\s*(?:\+\s*)?(years|year|yrs|ano|anos)/.exec(
    queryText.toLowerCase(),
  );

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
  options: FeatureEncodingOptions = {},
): number[] {
  const candidateVector = toCandidateFeatureVector(
    input.candidate,
    config,
    options,
  );

  const queryTokens = tokenize(input.queryText);
  const queryTokenSet = new Set(queryTokens.map(normalizeToken));
  // n-gram aware: filtering the vocabulary through a set of single query words
  // made every multi-word entry ("machine learning", "tailwind css")
  // structurally impossible to find, so those queries silently encoded as
  // "no skills requested".
  const queryKnownSkills = extractKnownTerms(
    input.queryText,
    config.knownSkills,
  );
  const queryKnownTitles = extractKnownTerms(
    input.queryText,
    config.knownTitles,
  );
  const queryKnownLanguages = extractKnownTerms(
    input.queryText,
    config.knownLanguages,
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
  const workTextTokens = tokenize(
    workHistoryText(input.candidate.workExperiences),
  );

  const queryWorkStackCoverage = overlapScore(queryKnownSkills, stackTokens);
  const queryWorkTitleCoverage = overlapScore(
    queryKnownTitles,
    heldTitleTokens,
  );
  const queryWorkTextCoverage = overlapScore(queryTokens, workTextTokens);

  const locationMentionScore = input.candidate.location
    ? queryTokenSet.has(normalizeToken(input.candidate.location))
      ? 1
      : 0
    : 0;
  // Arguments used to be the other way round, which measured "what fraction of
  // this candidate's languages did the recruiter mention" — so a trilingual who
  // speaks the requested language scored 0.33 while a monoglot scored 1.0. Every
  // neighbouring signal puts the request on the `expected` side; so does this
  // one now.
  const languageMentionScore = overlapScore(
    queryKnownLanguages,
    input.candidate.spokenLanguages,
  );
  const yearsHintScore = scoreYearsHint(
    input.queryText,
    input.candidate.totalYearsExperience,
  );
  const normalizedQueryLength = Math.min(queryTokens.length / 80, 1);

  // Posts vs the query. Tags are the candidate's own labelling of what a post is
  // about, so they compare directly against the requested skills; the post text
  // is the broader "did they write about any of this" signal.
  const posts = input.candidate.posts ?? [];
  const postTagCoverage =
    posts.length === 0
      ? 0
      : overlapScore(queryKnownSkills, postTagTokens(posts));
  const postTextCoverage =
    posts.length === 0
      ? 0
      : overlapScore(queryKnownSkills, tokenize(postText(posts)));

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
    postTagCoverage,
    postTextCoverage,
  ];
}

/** Slot budget per vocabulary. Changing any of these changes the input width. */
export const VOCABULARY_LIMITS = {
  locations: 40,
  skills: 160,
  titles: 80,
  languages: 20,
  noticePeriods: 10,
} as const;

/** Denominator for the post-count feature when a config predates `maxPostCount`. */
const DEFAULT_MAX_POST_COUNT = 6;

/**
 * Vocabulary terms that must survive truncation, whatever the real data looks
 * like. In practice this is the synthetic training blueprint.
 *
 * Without it the pipeline had a silent cliff: `buildDefaultPreprocessingConfig`
 * deduped in *insertion order* and sliced, and the training script prepended the
 * real rows. So once ~25-30 real resumes existed, React/Node/TypeScript fell off
 * the end of the 160-slot skill list — and the synthetic positives and negatives,
 * which are built entirely from those skills, collapsed into near-identical
 * vectors carrying opposite labels. Unlearnable, with no error anywhere.
 */
export interface VocabularyReservations {
  locations?: readonly string[];
  skills?: readonly string[];
  titles?: readonly string[];
  languages?: readonly string[];
  noticePeriods?: readonly string[];
}

/** What did not fit, per vocabulary — so the caller can log it. */
export interface DroppedVocabulary {
  locations: string[];
  skills: string[];
  titles: string[];
  languages: string[];
  noticePeriods: string[];
}

/**
 * Reserved terms first (in the order given), then the rest by descending
 * frequency, then truncated. Frequency ordering means the terms that do fall off
 * are the ones a single resume mentioned once — not whichever term happened to
 * be read last.
 */
function selectVocabulary(
  values: readonly string[],
  limit: number,
  reserved: readonly string[] = [],
): { kept: string[]; dropped: string[] } {
  const frequency = new Map<string, number>();
  for (const value of values) {
    const token = normalizeToken(value);
    if (token.length === 0) {
      continue;
    }
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const value of reserved) {
    const token = normalizeToken(value);
    if (token.length === 0 || seen.has(token)) {
      continue;
    }
    seen.add(token);
    ordered.push(token);
  }

  const remaining = [...frequency.entries()]
    .filter(([token]) => !seen.has(token))
    // Ties broken alphabetically so the vocabulary — and therefore the feature
    // order the model's weights are bound to — is deterministic across runs.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token);

  ordered.push(...remaining);

  return {
    kept: ordered.slice(0, limit),
    dropped: ordered.slice(limit),
  };
}

export function buildPreprocessingVocabulary(
  knownLocations: string[],
  knownSkills: string[],
  knownTitles: string[],
  knownLanguages: string[],
  knownNoticePeriods: string[],
  reserved: VocabularyReservations = {},
): { config: PreprocessingConfig; dropped: DroppedVocabulary } {
  const locations = selectVocabulary(
    knownLocations,
    VOCABULARY_LIMITS.locations,
    reserved.locations,
  );
  const skills = selectVocabulary(
    knownSkills,
    VOCABULARY_LIMITS.skills,
    reserved.skills,
  );
  const titles = selectVocabulary(
    knownTitles,
    VOCABULARY_LIMITS.titles,
    reserved.titles,
  );
  const languages = selectVocabulary(
    knownLanguages,
    VOCABULARY_LIMITS.languages,
    reserved.languages,
  );
  const noticePeriods = selectVocabulary(
    knownNoticePeriods,
    VOCABULARY_LIMITS.noticePeriods,
    reserved.noticePeriods,
  );

  return {
    config: {
      version: PREPROCESSING_VERSION,
      maxYearsExperience: 25,
      maxSalaryExpectation: 300000,
      maxLanguageCount: 6,
      maxWorkExperienceCount: 6,
      maxPostCount: DEFAULT_MAX_POST_COUNT,
      knownLocations: locations.kept,
      knownSkills: skills.kept,
      knownTitles: titles.kept,
      knownLanguages: languages.kept,
      knownNoticePeriods: noticePeriods.kept,
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
    },
    dropped: {
      locations: locations.dropped,
      skills: skills.dropped,
      titles: titles.dropped,
      languages: languages.dropped,
      noticePeriods: noticePeriods.dropped,
    },
  };
}

/** Backwards-compatible wrapper; prefer {@link buildPreprocessingVocabulary}. */
export function buildDefaultPreprocessingConfig(
  knownLocations: string[],
  knownSkills: string[],
  knownTitles: string[],
  knownLanguages: string[],
  knownNoticePeriods: string[],
  reserved: VocabularyReservations = {},
): PreprocessingConfig {
  return buildPreprocessingVocabulary(
    knownLocations,
    knownSkills,
    knownTitles,
    knownLanguages,
    knownNoticePeriods,
    reserved,
  ).config;
}
