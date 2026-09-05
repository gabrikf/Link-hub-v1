import * as tf from "@tensorflow/tfjs";
import {
  assertPreprocessingCompatible,
  blendMatchScore,
  extractKnownTerms,
  matchCoverage,
  preprocessingConfigSchema,
  toCandidateFeatureVector,
  toQueryCandidateFeatureVector,
  type PreprocessingConfig,
  type RecruiterSearchInput,
  type RecruiterSearchResult,
} from "@repo/schemas";

type RecruiterSearchFilters = NonNullable<RecruiterSearchInput["whereQuery"]>;

export interface SearchInputPayload {
  semanticQuery: string;
  filters: RecruiterSearchFilters;
  semanticSkills?: string[];
  semanticTitles?: string[];
}

interface RerankRequestMessage {
  type: "RERANK";
  payload: {
    candidates: RecruiterSearchResult[];
    searchInput: SearchInputPayload;
  };
}

interface RerankResponseMessage {
  type: "RERANK_RESULT";
  payload: {
    candidates: Array<RecruiterSearchResult & { aiScore: number }>;
  };
}

interface ErrorResponseMessage {
  type: "RERANK_ERROR";
  payload: {
    message: string;
    /** Set for failures the caller can classify, e.g. a stale model artifact. */
    code?: string;
  };
}

let loadedModel: tf.LayersModel | null = null;
let loadedPreprocessing: PreprocessingConfig | null = null;

const CDN_BASE: string =
  (import.meta.env.VITE_MODEL_CDN_BASE_URL as string | undefined) ?? "";

/**
 * Memoized so the two singleton loaders below — which run concurrently under
 * `Promise.all` — share one `latest.json` request instead of racing two
 * identical fetches on every cold start.
 */
let modelVersionPromise: Promise<string> | null = null;

function resolveModelVersion(): Promise<string> {
  if (!modelVersionPromise) {
    modelVersionPromise = (async () => {
      const response = await fetch(`${CDN_BASE}/ai-models/latest.json`);
      if (!response.ok) {
        return "v1";
      }
      const json = (await response.json()) as { version?: string };
      return json.version ?? "v1";
    })().catch((error: unknown) => {
      // Don't cache a failure — the next load attempt should retry.
      modelVersionPromise = null;
      throw error;
    });
  }

  return modelVersionPromise;
}

async function loadModelSingleton() {
  if (!loadedModel) {
    const version = await resolveModelVersion();
    loadedModel = await tf.loadLayersModel(
      `${CDN_BASE}/ai-models/${version}/model.json`,
    );
  }

  return loadedModel;
}

async function loadPreprocessingSingleton() {
  if (!loadedPreprocessing) {
    const version = await resolveModelVersion();
    const response = await fetch(
      `${CDN_BASE}/ai-models/${version}/preprocessing.json`,
    );
    if (!response.ok) {
      throw new Error("Failed to load preprocessing config");
    }

    const json: unknown = await response.json();
    loadedPreprocessing = preprocessingConfigSchema.parse(json);
  }

  return loadedPreprocessing;
}

export function getModelInputDimension(model: tf.LayersModel): number | null {
  const shape = model.inputs[0]?.shape;
  if (!shape || shape.length < 2) {
    return null;
  }

  const dim = shape[1];
  return typeof dim === "number" ? dim : null;
}

/**
 * What the recruiter actually asked for, as terms.
 *
 * The free-text path used to filter the query through a vocabulary built from
 * the RETURNED result set. That is backwards in the one case that matters: a
 * skill nobody in the top 50 has gets dropped from the request, the
 * weight-4 skills bucket is skipped entirely, and everyone scores high
 * *precisely because nobody matches*. The catalog now comes from the model's own
 * persisted vocabulary — which exists independently of any one search — and the
 * structured `semanticSkills` / `semanticTitles` produced by query conversion
 * take precedence over anything guessed from prose.
 */
export function resolveRequestedTerms(
  searchInput: SearchInputPayload,
  catalog: { skills: readonly string[]; titles: readonly string[] },
): { skills: string[]; titles: string[] } {
  const skills = searchInput.filters.skills?.length
    ? searchInput.filters.skills
    : searchInput.semanticSkills?.length
      ? searchInput.semanticSkills
      : extractKnownTerms(searchInput.semanticQuery, catalog.skills);

  const titles = searchInput.filters.titles?.length
    ? searchInput.filters.titles
    : searchInput.semanticTitles?.length
      ? searchInput.semanticTitles
      : extractKnownTerms(searchInput.semanticQuery, catalog.titles);

  return { skills: [...skills], titles: [...titles] };
}

function withScores(
  candidates: RecruiterSearchResult[],
  predictions: ArrayLike<number>,
  searchInput: SearchInputPayload,
  catalog: { skills: readonly string[]; titles: readonly string[] },
): Array<RecruiterSearchResult & { aiScore: number }> {
  const modelScores = Array.from(predictions);
  const requested = resolveRequestedTerms(searchInput, catalog);

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      aiScore: blendMatchScore({
        modelScore: modelScores[index] ?? 0,
        coverageScore: computeAlignmentScore(searchInput, candidate, requested),
      }),
    }))
    .sort((a, b) => b.aiScore - a.aiScore);
}

// Weighted bucket: a score in [0,1] plus how much it counts. Buckets the
// recruiter did not express (weight 0) are skipped so an unconstrained field
// never silently inflates the match the way a neutral "1" used to.
interface WeightedBucket {
  score: number;
  weight: number;
}

function workStackTokens(candidate: RecruiterSearchResult): string[] {
  return candidate.workExperiences.flatMap(
    (experience) => experience.mainStack,
  );
}

function workTitleTokens(candidate: RecruiterSearchResult): string[] {
  return candidate.workExperiences
    .map((experience) => experience.title)
    .filter((value): value is string => Boolean(value && value.trim()));
}

function postTagTokens(candidate: RecruiterSearchResult): string[] {
  return candidate.workEvidence.flatMap((post) => post.tags);
}

/**
 * Does the candidate's declared salary band overlap the one the recruiter asked
 * for?
 *
 * The old version scored `salaryExpectationMax` against BOTH bounds and returned
 * 0 when it was null — so a candidate who had passed the SQL salary filter and
 * simply hadn't filled in a number was penalised for it. Silence is not a
 * mismatch: an undeclared band returns null and the signal is skipped.
 */
export function salaryOverlapScore(
  filters: Pick<RecruiterSearchFilters, "minSalary" | "maxSalary">,
  candidate: Pick<
    RecruiterSearchResult,
    "salaryExpectationMin" | "salaryExpectationMax"
  >,
): number | null {
  if (filters.minSalary === undefined && filters.maxSalary === undefined) {
    return null;
  }

  const candidateMin = candidate.salaryExpectationMin;
  const candidateMax = candidate.salaryExpectationMax;

  if (candidateMin === null && candidateMax === null) {
    return null;
  }

  const low = candidateMin ?? candidateMax ?? 0;
  const high = candidateMax ?? candidateMin ?? 0;

  const wantedLow = filters.minSalary ?? Number.NEGATIVE_INFINITY;
  const wantedHigh = filters.maxSalary ?? Number.POSITIVE_INFINITY;

  const overlaps = low <= wantedHigh && high >= wantedLow;
  return overlaps ? 1 : 0;
}

/**
 * Compares the recruiter's search against one candidate and returns a realistic
 * 0–1 match. It mirrors the training target exactly — skills 4x, titles 2x, work
 * history 2x, everything else 1x — and, since Task B, uses the *same*
 * `matchCoverage` implementation the target is built from. Only the things the
 * recruiter actually asked for are scored.
 */
export function computeAlignmentScore(
  searchInput: SearchInputPayload,
  candidate: RecruiterSearchResult,
  requested: { skills: string[]; titles: string[] },
): number {
  const filters = searchInput.filters;
  const buckets: WeightedBucket[] = [];

  // Skills — the strongest signal (4x). `matchCoverage` is substring-aware, so a
  // candidate whose only skill is "React Native" now scores on a mandatory
  // `skills: ["react"]` filter. They were already in the results — the SQL
  // filter matches with `LIKE '%react%'` — and used to be shown as a "Weak
  // match" for matching exactly what was required.
  if (requested.skills.length > 0) {
    buckets.push({
      score: matchCoverage(requested.skills, candidate.skills),
      weight: 4,
    });
  }

  // Titles (2x).
  if (requested.titles.length > 0) {
    buckets.push({
      score: matchCoverage(requested.titles, candidate.titles),
      weight: 2,
    });
  }

  // Evidence (2x): the stack the candidate actually used on the job, the roles
  // they held, and the tags on what they published. Only counts when there is
  // something to compare it against.
  const hasRequest = requested.skills.length > 0 || requested.titles.length > 0;
  const hasEvidence =
    candidate.workExperiences.length > 0 || candidate.workEvidence.length > 0;

  if (hasRequest && hasEvidence) {
    const evidenceScores = [
      requested.skills.length > 0
        ? matchCoverage(requested.skills, workStackTokens(candidate))
        : 0,
      requested.titles.length > 0
        ? matchCoverage(requested.titles, workTitleTokens(candidate))
        : 0,
      requested.skills.length > 0 && candidate.workEvidence.length > 0
        ? matchCoverage(requested.skills, postTagTokens(candidate))
        : 0,
    ];

    buckets.push({ score: Math.max(...evidenceScores), weight: 2 });
  }

  // Base signals (1x). Everything the SQL already enforced as a HARD filter has
  // been removed from here: seniority, work model, contract type, location,
  // notice period, relocation and the years range are true for every candidate
  // that came back, so scoring them added a constant 1 to every bucket average
  // and discriminated nothing. What is left genuinely varies between results.
  const baseSignals: number[] = [];

  if (filters.spokenLanguages?.length) {
    // Partial credit is real here: the filter admits a candidate who speaks one
    // of two requested languages, and that is a worse fit than one who speaks
    // both.
    baseSignals.push(
      matchCoverage(filters.spokenLanguages, candidate.spokenLanguages),
    );
  }

  const salaryScore = salaryOverlapScore(filters, candidate);
  if (salaryScore !== null) {
    baseSignals.push(salaryScore);
  }

  if (baseSignals.length > 0) {
    buckets.push({
      score:
        baseSignals.reduce((sum, value) => sum + value, 0) / baseSignals.length,
      weight: 1,
    });
  }

  if (buckets.length === 0) {
    return 0;
  }

  const totalWeight = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  return (
    buckets.reduce((sum, bucket) => sum + bucket.score * bucket.weight, 0) /
    totalWeight
  );
}

/** Maps the API's candidate shape onto the feature encoder's input. */
export function toCandidateFeatureInput(candidate: RecruiterSearchResult) {
  return {
    headlineTitle: candidate.headlineTitle,
    summary: candidate.summary,
    totalYearsExperience: candidate.totalYearsExperience,
    seniorityLevel: candidate.seniorityLevel,
    workModel: candidate.workModel,
    contractType: candidate.contractType,
    location: candidate.location,
    spokenLanguages: candidate.spokenLanguages,
    noticePeriod: candidate.noticePeriod,
    openToRelocation: candidate.openToRelocation,
    salaryExpectationMin: candidate.salaryExpectationMin,
    salaryExpectationMax: candidate.salaryExpectationMax,
    skills: candidate.skills,
    titles: candidate.titles,
    workExperiences: candidate.workExperiences.map((experience) => ({
      title: experience.title,
      companyName: experience.companyName,
      description: experience.description,
      mainStack: experience.mainStack,
    })),
    // The worker used to drop `workEvidence` on the floor while building its
    // input, so the post features were structurally zero at serve time no matter
    // what the model had learned.
    posts: candidate.workEvidence.map((post) => ({
      title: post.title,
      excerpt: post.excerpt,
      source: post.source,
      tags: post.tags,
      publishedAt: post.publishedAt,
    })),
  };
}

self.onmessage = async (event: MessageEvent<RerankRequestMessage>) => {
  const message = event.data;

  if (message.type !== "RERANK") {
    return;
  }

  try {
    const [model, preprocessing] = await Promise.all([
      loadModelSingleton(),
      loadPreprocessingSingleton(),
    ]);

    const expectedInputDim = getModelInputDimension(model);

    // Fail loudly and early. A v1 config (125 features) sitting next to a v2
    // model (130 inputs) parsed fine and then either threw from deep inside
    // TensorFlow or — worse — scored every candidate through a feature space the
    // weights were never trained on.
    assertPreprocessingCompatible(preprocessing, expectedInputDim);

    const vectors = message.payload.candidates.map((candidate) => {
      const candidateInput = toCandidateFeatureInput(candidate);

      const queryAwareVector = toQueryCandidateFeatureVector(
        {
          queryText: message.payload.searchInput.semanticQuery,
          candidate: candidateInput,
        },
        preprocessing,
      );

      if (expectedInputDim === queryAwareVector.length) {
        return queryAwareVector;
      }

      const candidateOnlyVector = toCandidateFeatureVector(
        candidateInput,
        preprocessing,
      );

      if (expectedInputDim === candidateOnlyVector.length) {
        return candidateOnlyVector;
      }

      return queryAwareVector;
    });

    const tensor = tf.tensor2d(vectors);
    const output = model.predict(tensor) as tf.Tensor;
    const predictions = await output.data();
    tensor.dispose();
    output.dispose();

    const response: RerankResponseMessage = {
      type: "RERANK_RESULT",
      payload: {
        candidates: withScores(
          message.payload.candidates,
          predictions,
          message.payload.searchInput,
          {
            skills: preprocessing.knownSkills,
            titles: preprocessing.knownTitles,
          },
        ),
      },
    };

    self.postMessage(response);
  } catch (error) {
    const response: ErrorResponseMessage = {
      type: "RERANK_ERROR",
      payload: {
        message:
          error instanceof Error ? error.message : "Unknown worker error",
        code:
          error instanceof Error &&
          error.name === "PreprocessingCompatibilityError"
            ? "PREPROCESSING_INCOMPATIBLE"
            : undefined,
      },
    };

    self.postMessage(response);
  }
};
