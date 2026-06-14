import * as tf from "@tensorflow/tfjs";
import {
  preprocessingConfigSchema,
  toCandidateFeatureVector,
  toQueryCandidateFeatureVector,
  type PreprocessingConfig,
  type RecruiterSearchInput,
  type RecruiterSearchResult,
} from "@repo/schemas";

type RecruiterSearchFilters = NonNullable<RecruiterSearchInput["whereQuery"]>;

interface RerankRequestMessage {
  type: "RERANK";
  payload: {
    candidates: RecruiterSearchResult[];
    searchInput: {
      semanticQuery: string;
      filters: RecruiterSearchFilters;
      semanticSkills?: string[];
      semanticTitles?: string[];
    };
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
  };
}

let loadedModel: tf.LayersModel | null = null;
let loadedPreprocessing: PreprocessingConfig | null = null;

const CDN_BASE: string =
  (import.meta.env.VITE_MODEL_CDN_BASE_URL as string | undefined) ?? "";

async function resolveModelVersion(): Promise<string> {
  const response = await fetch(`${CDN_BASE}/ai-models/latest.json`);
  if (!response.ok) {
    return "v1";
  }
  const json = (await response.json()) as { version?: string };
  return json.version ?? "v1";
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

    const json = await response.json();
    loadedPreprocessing = preprocessingConfigSchema.parse(json);
  }

  return loadedPreprocessing;
}

function withScores(
  candidates: RecruiterSearchResult[],
  predictions: ArrayLike<number>,
  searchInput: {
    semanticQuery: string;
    filters: RecruiterSearchFilters;
    semanticSkills?: string[];
    semanticTitles?: string[];
  },
): Array<RecruiterSearchResult & { aiScore: number }> {
  const modelScores = Array.from(predictions);

  // Vocabulary of real skills/titles seen across the result set. When the
  // recruiter searches with free text (no skill/title chips), we use this to
  // pull the *actual* requested skills out of the query instead of treating
  // every word ("role", "seniority"…) as a required skill — which would
  // wrongly deflate every candidate's match.
  const vocabulary = buildVocabulary(candidates);

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      aiScore: blendScores({
        modelScore: modelScores[index] ?? 0,
        alignmentScore: computeAlignmentScore(searchInput, candidate, vocabulary),
      }),
    }))
    .sort((a, b) => b.aiScore - a.aiScore);
}

interface SearchVocabulary {
  skills: Set<string>;
  titles: Set<string>;
}

function buildVocabulary(
  candidates: RecruiterSearchResult[],
): SearchVocabulary {
  const skills = new Set<string>();
  const titles = new Set<string>();
  for (const candidate of candidates) {
    for (const skill of candidate.skills) {
      skills.add(normalizeToken(skill));
    }
    for (const title of candidate.titles) {
      titles.add(normalizeToken(title));
    }
    for (const experience of candidate.workExperiences) {
      for (const tech of experience.mainStack) {
        skills.add(normalizeToken(tech));
      }
      if (experience.title) {
        titles.add(normalizeToken(experience.title));
      }
    }
  }
  return { skills, titles };
}

function getModelInputDimension(model: tf.LayersModel): number | null {
  const shape = model.inputs[0]?.shape;
  if (!shape || shape.length < 2) {
    return null;
  }

  const dim = shape[1];
  return typeof dim === "number" ? dim : null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function overlapScore(expected: string[], actual: string[]): number {
  if (expected.length === 0) {
    return 1;
  }

  const expectedSet = new Set(expected.map(normalizeToken));
  const actualSet = new Set(actual.map(normalizeToken));

  if (expectedSet.size === 0) {
    return 1;
  }

  const matched = [...expectedSet].filter((value) => actualSet.has(value));
  return matched.length / expectedSet.size;
}

function matchOrNeutral(value: boolean): number {
  return value ? 1 : 0;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function rangeScore(
  min: number | undefined,
  max: number | undefined,
  value: number | null,
): number {
  if (min === undefined && max === undefined) {
    return 1;
  }

  if (value === null) {
    return 0;
  }

  if (min !== undefined && value < min) {
    return 0;
  }

  if (max !== undefined && value > max) {
    return 0;
  }

  return 1;
}

function blendScores(input: {
  modelScore: number;
  alignmentScore: number;
}): number {
  const safeModel = Number.isFinite(input.modelScore)
    ? Math.max(0, Math.min(input.modelScore, 1))
    : 0;
  const safeAlignment = Math.max(0, Math.min(input.alignmentScore, 1));

  // The trained model and the transparent alignment score are two views of the
  // SAME comparison (the model is trained to reproduce the weighted overlap).
  // Averaging them keeps the percentage honest if either side is slightly off,
  // and the result reads as a real "how much of what you asked for does this
  // person have" rather than a compressed similarity number.
  return safeModel * 0.5 + safeAlignment * 0.5;
}

// Weighted bucket: a score in [0,1] plus how much it counts. Buckets the
// recruiter did not express (weight 0) are skipped so an unconstrained field
// never silently inflates the match the way a neutral "1" used to.
interface WeightedBucket {
  score: number;
  weight: number;
}

function workStackTokens(candidate: RecruiterSearchResult): string[] {
  return candidate.workExperiences.flatMap((experience) => experience.mainStack);
}

function workTitleTokens(candidate: RecruiterSearchResult): string[] {
  return candidate.workExperiences
    .map((experience) => experience.title)
    .filter((value): value is string => Boolean(value && value.trim()));
}

/**
 * Compares the recruiter's search against one candidate and returns a realistic
 * 0–1 match. It mirrors the training target exactly: skills count 4x, titles 2x,
 * work history 2x, everything else 1x. Only the things the recruiter actually
 * asked for are scored, so the percentage reflects real coverage of the request.
 */
function computeAlignmentScore(
  searchInput: {
    semanticQuery: string;
    filters: RecruiterSearchFilters;
    semanticSkills?: string[];
    semanticTitles?: string[];
  },
  candidate: RecruiterSearchResult,
  vocabulary: SearchVocabulary,
): number {
  const filters = searchInput.filters;
  const queryTokens = tokenize(searchInput.semanticQuery);

  // Free-text fallback: keep only query words that are real skills/titles in
  // the result vocabulary (e.g. "react", "node.js") and drop filler words.
  const querySkillTerms = queryTokens.filter((token) =>
    vocabulary.skills.has(token),
  );
  const queryTitleTerms = queryTokens.filter((token) =>
    vocabulary.titles.has(token),
  );

  // What did the recruiter ask for? Mandatory filters win; otherwise the
  // semantic skills/titles from the form; otherwise the skill/title-like terms
  // found in the query.
  const effectiveSkills = filters.skills?.length
    ? filters.skills
    : searchInput.semanticSkills?.length
      ? searchInput.semanticSkills
      : querySkillTerms;
  const effectiveTitles = filters.titles?.length
    ? filters.titles
    : searchInput.semanticTitles?.length
      ? searchInput.semanticTitles
      : queryTitleTerms;

  const buckets: WeightedBucket[] = [];

  // Skills — the strongest signal (4x).
  if (effectiveSkills.length > 0) {
    buckets.push({
      score: overlapScore(effectiveSkills, candidate.skills),
      weight: 4,
    });
  }

  // Titles (2x).
  if (effectiveTitles.length > 0) {
    buckets.push({
      score: overlapScore(effectiveTitles, candidate.titles),
      weight: 2,
    });
  }

  // Work history (2x): does the candidate's real job history — the stack they
  // used and the roles they held — cover the request? Only counts when the
  // recruiter actually asked for skills or titles (otherwise there is nothing
  // to compare the history against).
  if (
    candidate.workExperiences.length > 0 &&
    (effectiveSkills.length > 0 || effectiveTitles.length > 0)
  ) {
    const stackCoverage =
      effectiveSkills.length > 0
        ? overlapScore(effectiveSkills, workStackTokens(candidate))
        : 0;
    const roleCoverage =
      effectiveTitles.length > 0
        ? overlapScore(effectiveTitles, workTitleTokens(candidate))
        : 0;
    buckets.push({
      score: Math.max(stackCoverage, roleCoverage),
      weight: 2,
    });
  }

  // Base signals (1x total) — only those the recruiter constrained.
  const baseSignals: number[] = [];

  if (filters.spokenLanguages?.length) {
    baseSignals.push(
      overlapScore(filters.spokenLanguages, candidate.spokenLanguages),
    );
  }
  if (filters.contractTypes?.length) {
    baseSignals.push(
      matchOrNeutral(
        Boolean(
          candidate.contractType &&
            filters.contractTypes.includes(candidate.contractType),
        ),
      ),
    );
  }
  if (filters.seniorityLevels?.length) {
    baseSignals.push(
      matchOrNeutral(
        Boolean(
          candidate.seniorityLevel &&
            filters.seniorityLevels.includes(candidate.seniorityLevel),
        ),
      ),
    );
  }
  if (filters.workModels?.length) {
    baseSignals.push(
      matchOrNeutral(
        Boolean(
          candidate.workModel &&
            filters.workModels.includes(candidate.workModel),
        ),
      ),
    );
  }
  if (filters.locations?.length) {
    const candidateLocation = normalizeToken(candidate.location ?? "");
    const allowedLocations = new Set(filters.locations.map(normalizeToken));
    baseSignals.push(matchOrNeutral(allowedLocations.has(candidateLocation)));
  }
  if (filters.noticePeriods?.length) {
    const candidateNotice = normalizeToken(candidate.noticePeriod ?? "");
    const allowedNotice = new Set(filters.noticePeriods.map(normalizeToken));
    baseSignals.push(matchOrNeutral(allowedNotice.has(candidateNotice)));
  }
  if (filters.openToRelocation !== undefined) {
    baseSignals.push(
      matchOrNeutral(candidate.openToRelocation === filters.openToRelocation),
    );
  }
  if (
    filters.minYearsExperience !== undefined ||
    filters.maxYearsExperience !== undefined
  ) {
    baseSignals.push(
      rangeScore(
        filters.minYearsExperience,
        filters.maxYearsExperience,
        candidate.totalYearsExperience,
      ),
    );
  }
  if (filters.minSalary !== undefined || filters.maxSalary !== undefined) {
    baseSignals.push(
      rangeScore(filters.minSalary, filters.maxSalary, candidate.salaryExpectationMax),
    );
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

    const vectors = message.payload.candidates.map((candidate) => {
      const candidateInput = {
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
      };

      const queryAwareVector = toQueryCandidateFeatureVector(
        {
          queryText: message.payload.searchInput.semanticQuery,
          candidate: candidateInput,
        },
        preprocessing,
      );

      const candidateOnlyVector = toCandidateFeatureVector(
        candidateInput,
        preprocessing,
      );

      if (expectedInputDim === queryAwareVector.length) {
        return queryAwareVector;
      }

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
      },
    };

    self.postMessage(response);
  }
};
