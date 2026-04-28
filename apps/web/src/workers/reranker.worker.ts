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
  const maxModelScore = modelScores.reduce((max, score) => {
    const safeScore = Number.isFinite(score) ? score : 0;
    return Math.max(max, safeScore);
  }, 0);

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      aiScore: blendScores({
        modelScore: modelScores[index] ?? 0,
        maxModelScore,
        alignmentScore: computeAlignmentScore(searchInput, candidate),
      }),
    }))
    .sort((a, b) => b.aiScore - a.aiScore);
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

function normalizeModelScore(score: number, maxModelScore: number): number {
  const safeScore = Number.isFinite(score) ? score : 0;
  if (maxModelScore <= 0) {
    return Math.max(0, Math.min(safeScore, 1));
  }

  return Math.max(0, Math.min(safeScore / maxModelScore, 1));
}

function blendScores(input: {
  modelScore: number;
  maxModelScore: number;
  alignmentScore: number;
}): number {
  const normalizedModel = normalizeModelScore(
    input.modelScore,
    input.maxModelScore,
  );
  const safeAlignment = Math.max(0, Math.min(input.alignmentScore, 1));

  // Weight alignment higher so reranking follows the active recruiter query intent.
  return normalizedModel * 0.4 + safeAlignment * 0.6;
}

function computeAlignmentScore(
  searchInput: {
    semanticQuery: string;
    filters: RecruiterSearchFilters;
    semanticSkills?: string[];
    semanticTitles?: string[];
  },
  candidate: RecruiterSearchResult,
): number {
  const filters = searchInput.filters;
  const signals: number[] = [];

  // When mandatory filter skills/titles are absent, fall back to the semantic
  // skills and titles the recruiter expressed in the search form.  These carry
  // the recruiter's intent and must be used to penalise mismatches.
  const effectiveSkills = filters.skills?.length
    ? filters.skills
    : (searchInput.semanticSkills ?? []);
  const effectiveTitles = filters.titles?.length
    ? filters.titles
    : (searchInput.semanticTitles ?? []);

  signals.push(
    overlapScore(effectiveSkills, candidate.skills),
    overlapScore(effectiveTitles, candidate.titles),
    overlapScore(filters.spokenLanguages ?? [], candidate.spokenLanguages),
  );

  if (filters.contractTypes?.length) {
    signals.push(
      matchOrNeutral(
        Boolean(
          candidate.contractType &&
            filters.contractTypes.includes(candidate.contractType),
        ),
      ),
    );
  }

  if (filters.seniorityLevels?.length) {
    signals.push(
      matchOrNeutral(
        Boolean(
          candidate.seniorityLevel &&
            filters.seniorityLevels.includes(candidate.seniorityLevel),
        ),
      ),
    );
  }

  if (filters.workModels?.length) {
    signals.push(
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
    signals.push(matchOrNeutral(allowedLocations.has(candidateLocation)));
  }

  if (filters.noticePeriods?.length) {
    const candidateNotice = normalizeToken(candidate.noticePeriod ?? "");
    const allowedNotice = new Set(filters.noticePeriods.map(normalizeToken));
    signals.push(matchOrNeutral(allowedNotice.has(candidateNotice)));
  }

  if (filters.openToRelocation !== undefined) {
    signals.push(
      matchOrNeutral(candidate.openToRelocation === filters.openToRelocation),
    );
  }

  signals.push(
    rangeScore(
      filters.minYearsExperience,
      filters.maxYearsExperience,
      candidate.totalYearsExperience,
    ),
    rangeScore(
      filters.minSalary,
      filters.maxSalary,
      candidate.salaryExpectationMax,
    ),
  );

  const queryTokens = tokenize(searchInput.semanticQuery);
  if (queryTokens.length > 0) {
    const candidateCorpus = tokenize(
      [
        candidate.headlineTitle,
        candidate.summary,
        candidate.location,
        candidate.seniorityLevel,
        candidate.contractType,
        candidate.workModel,
        candidate.noticePeriod,
        candidate.skills.join(" "),
        candidate.titles.join(" "),
      ]
        .filter((value): value is string => Boolean(value))
        .join(" "),
    );

    signals.push(overlapScore(queryTokens, candidateCorpus));
  }

  if (signals.length === 0) {
    return 0;
  }

  return signals.reduce((sum, value) => sum + value, 0) / signals.length;
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
