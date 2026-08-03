import "dotenv/config";
import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import postgres from "postgres";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MATCH_METRIC_ID,
  PREPROCESSING_VERSION,
  buildPreprocessingVocabulary,
  preprocessingConfigSchema,
  toQueryCandidateFeatureVector,
  type PreprocessingConfig,
} from "@repo/schemas";
import { fileURLToPath } from "node:url";
import { blueprintVocabulary } from "../lib/blueprints.js";
import {
  aggregateInteractions,
  buildTrainingRows,
  resolveLabel,
} from "../lib/labels.js";
import {
  deriveSkipAboveNegatives,
  expandByImportanceWeight,
  inversePropensityWeight,
} from "../lib/exposure.js";
import { resolveNextVersion } from "../lib/model-versions.js";
import { decideWarmStart } from "../lib/warm-start.js";
import {
  buildCalibrationReport,
  evaluateCalibrationGates,
} from "../lib/quality-gates.js";
import { enrichDatasetWithSyntheticRows } from "../lib/synthetic.js";
import { temporalSplit } from "../lib/temporal-split.js";
import type {
  CandidateTrainingProfile,
  InteractionTrainingRow,
  ResumeTrainingRow,
  TrainingState,
} from "../lib/training-types.js";

type TrainMode = "initial" | "incremental";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../../");
const modelsDir = path.join(rootDir, "apps/web/public/ai-models");
const latestJsonPath = path.join(modelsDir, "latest.json");
const trainingStatePath = path.join(
  rootDir,
  "apps/training/.cache/last-training.json",
);

/**
 * Synthetic supervision is additive: this floor plus a share of the real data.
 * See `enrichDatasetWithSyntheticRows` for why "target minus real" was a bug and
 * not a policy.
 */
const SYNTHETIC_FLOOR = { initial: 720, incremental: 180 } as const;
const SYNTHETIC_RATIO_TO_REAL = 0.5;

/** Reads the --mode argument to switch between initial and incremental training. */
function parseMode(): TrainMode {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  if (!modeArg) {
    return "initial";
  }

  const parsed = modeArg.split("=")[1];
  return parsed === "incremental" ? "incremental" : "initial";
}

/** Loads the timestamp of the last successful training run. */
async function readState(): Promise<TrainingState | null> {
  try {
    const raw = await readFile(trainingStatePath, "utf-8");
    return JSON.parse(raw) as TrainingState;
  } catch {
    return null;
  }
}

/** Persists the timestamp used by incremental training. */
async function writeState(state: TrainingState): Promise<void> {
  await mkdir(path.dirname(trainingStatePath), { recursive: true });
  await writeFile(trainingStatePath, JSON.stringify(state, null, 2), "utf-8");
}

async function readCurrentVersion(): Promise<string | null> {
  try {
    const raw = await readFile(latestJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

async function listExistingVersions(): Promise<string[]> {
  try {
    const entries = await readdir(modelsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Writes the updated version pointer. */
async function writeLatestJson(version: string): Promise<void> {
  await writeFile(
    latestJsonPath,
    JSON.stringify({ version }, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Every interaction we are allowed to train on.
 *
 * `cutoff` is captured BEFORE any loading starts and applied here. Training
 * takes minutes; without it, anything a recruiter did during the run was marked
 * `trained_at` at the end without ever having been read — invisible to this run
 * and to every future one.
 */
async function loadInteractions(
  sqlClient: postgres.Sql,
  mode: TrainMode,
  cutoff: Date,
): Promise<InteractionTrainingRow[]> {
  const rows = await sqlClient<
    {
      resumeId: string;
      interactionType: string;
      queryText: string | null;
      querySnapshot: Record<string, unknown> | null;
      candidateSnapshot: Record<string, unknown> | null;
      displayedRank: number | null;
      resultCount: number | null;
      searchSessionId: string | null;
      propensity: number | null;
      createdAt: Date;
    }[]
  >`
    SELECT
      ci.resume_id AS "resumeId",
      ci.interaction_type AS "interactionType",
      ci.query_text AS "queryText",
      ci.query_snapshot AS "querySnapshot",
      ci.candidate_snapshot AS "candidateSnapshot",
      -- Rows written by the contact-reveal endpoint carry their exposure in the
      -- older rank_position column and their session inside metadata, because
      -- that endpoint's request body predates the dedicated columns. Coalescing
      -- here is what keeps those rows eligible for IPS weighting and for
      -- skip-above derivation instead of silently falling back to weight 1.
      COALESCE(ci.displayed_rank, ci.rank_position) AS "displayedRank",
      ci.result_count AS "resultCount",
      COALESCE(ci.search_session_id, ci.metadata->>'searchSessionId') AS "searchSessionId",
      ci.propensity AS "propensity",
      ci.created_at AS "createdAt"
    FROM candidate_interactions ci
    WHERE ci.created_at <= ${cutoff}
      ${mode === "incremental" ? sqlClient`AND ci.trained_at IS NULL` : sqlClient``}
  `;

  return rows.map((row) => ({
    ...row,
    interactionType: row.interactionType as InteractionTrainingRow["interactionType"],
  }));
}

/**
 * Candidate profiles for a set of resume ids.
 *
 * Skills, titles, work history and posts come from correlated subqueries rather
 * than `LEFT JOIN … GROUP BY`. That is the shape that makes the fan-out
 * impossible: there is exactly one output row per resume, so nothing can be
 * multiplied by "how many skills this person listed".
 */
async function loadCandidateProfiles(
  sqlClient: postgres.Sql,
  resumeIds: readonly string[],
): Promise<Map<string, CandidateTrainingProfile>> {
  if (resumeIds.length === 0) {
    return new Map();
  }

  const rows = await sqlClient<CandidateTrainingProfile[]>`
    SELECT
      r.id AS "resumeId",
      r.headline_title AS "headlineTitle",
      r.summary AS "summary",
      r.total_years_experience AS "totalYearsExperience",
      r.seniority_level AS "seniorityLevel",
      r.work_model AS "workModel",
      r.contract_type AS "contractType",
      r.location AS "location",
      COALESCE(r.spoken_languages, ARRAY[]::text[]) AS "spokenLanguages",
      r.notice_period AS "noticePeriod",
      r.open_to_relocation AS "openToRelocation",
      r.salary_expectation_min AS "salaryExpectationMin",
      r.salary_expectation_max AS "salaryExpectationMax",
      COALESCE((
        SELECT array_agg(DISTINCT sc.name)
        FROM resume_skills rs
        JOIN skills_catalog sc ON sc.id = rs.skill_id
        WHERE rs.resume_id = r.id
      ), ARRAY[]::text[]) AS "skills",
      COALESCE((
        SELECT array_agg(DISTINCT tc.name)
        FROM resume_titles rt
        JOIN titles_catalog tc ON tc.id = rt.title_id
        WHERE rt.resume_id = r.id
      ), ARRAY[]::text[]) AS "titles",
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'title', we.title,
            'companyName', we.company_name,
            'description', we.description,
            'mainStack', we.main_stack
          )
          ORDER BY we.display_order
        )
        FROM work_experiences we
        WHERE we.user_id = r.user_id
      ), '[]'::json) AS "workExperiences",
      COALESCE((
        SELECT json_agg(evidence ORDER BY evidence->>'publishedAt' DESC)
        FROM (
          SELECT json_build_object(
            'title', p.title,
            'excerpt', left(p.body, 240),
            'source', p.source,
            'tags', COALESCE(p.tags, '[]'::jsonb),
            'publishedAt', p.published_at
          ) AS evidence
          FROM posts p
          WHERE p.user_id = r.user_id
            AND p.status = 'published'
          ORDER BY p.published_at DESC NULLS LAST
          LIMIT 10
        ) recent_posts
      ), '[]'::json) AS "posts"
    FROM resumes r
    WHERE r.id = ANY(${sqlClient.array([...resumeIds])}::uuid[])
  `;

  return new Map(rows.map((row) => [row.resumeId, normalizeProfile(row)]));
}

/** Postgres hands back nulls where the encoder wants arrays. */
function normalizeProfile(
  row: CandidateTrainingProfile,
): CandidateTrainingProfile {
  return {
    ...row,
    spokenLanguages: row.spokenLanguages ?? [],
    skills: row.skills ?? [],
    titles: row.titles ?? [],
    workExperiences: (row.workExperiences ?? []).map((experience) => ({
      ...experience,
      mainStack: experience.mainStack ?? [],
    })),
    posts: (row.posts ?? []).map((post) => ({
      ...post,
      excerpt: post.excerpt ?? "",
      tags: Array.isArray(post.tags) ? post.tags : [],
    })),
  };
}

/**
 * Loads the real training rows: one per (query, candidate), with exposure
 * context, plus the skip-above negatives the sessions imply.
 */
async function loadDataset(
  sqlClient: postgres.Sql,
  mode: TrainMode,
  cutoff: Date,
): Promise<ResumeTrainingRow[]> {
  const interactions = await loadInteractions(sqlClient, mode, cutoff);
  if (interactions.length === 0) {
    return [];
  }

  const aggregates = aggregateInteractions(interactions);
  const profiles = await loadCandidateProfiles(
    sqlClient,
    [...new Set(aggregates.map((aggregate) => aggregate.resumeId))],
  );

  const rows = buildTrainingRows(aggregates, profiles);
  const skipAbove = deriveSkipAboveNegatives(rows);

  if (skipAbove.length > 0) {
    console.log(
      `[training] Derived ${skipAbove.length} skip-above negatives from logged exposure`,
    );
  }

  return [...rows, ...skipAbove];
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function buildFallbackQueryText(row: ResumeTrainingRow): string {
  return [
    row.headlineTitle,
    row.seniorityLevel,
    row.location,
    row.workModel,
    row.contractType,
    row.skills.join(", "),
    row.titles.join(", "),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n");
}

export function encodeRow(
  row: ResumeTrainingRow,
  config: PreprocessingConfig,
  now: number,
): number[] {
  return toQueryCandidateFeatureVector(
    {
      queryText: row.queryText?.trim() || buildFallbackQueryText(row),
      candidate: {
        headlineTitle: row.headlineTitle,
        summary: row.summary,
        totalYearsExperience: row.totalYearsExperience,
        seniorityLevel: row.seniorityLevel,
        workModel: row.workModel,
        contractType: row.contractType,
        location: row.location,
        spokenLanguages: row.spokenLanguages,
        noticePeriod: row.noticePeriod,
        openToRelocation: row.openToRelocation,
        salaryExpectationMin: row.salaryExpectationMin,
        salaryExpectationMax: row.salaryExpectationMax,
        skills: row.skills,
        titles: row.titles,
        workExperiences: row.workExperiences,
        posts: row.posts,
      },
    },
    config,
    { now },
  );
}

interface Matrices {
  xs: tf.Tensor2D;
  ys: tf.Tensor2D;
  labels: number[];
}

/**
 * Feature and label tensors.
 *
 * No shuffling happens here any more: the split is temporal and done by the
 * caller, so shuffling before splitting would be exactly the leak the temporal
 * split exists to prevent. `model.fit({ shuffle: true })` still shuffles within
 * the training set, which is all that was ever needed.
 *
 * `applyIps` turns the inverse-propensity weights into row replication — tfjs
 * has no `sampleWeight` — and is off for the held-out set, where every example
 * must count once or the calibration numbers describe a distribution nobody
 * will ever see.
 */
function buildTrainingMatrices(
  dataset: readonly ResumeTrainingRow[],
  config: PreprocessingConfig,
  now: number,
  applyIps: boolean,
): Matrices {
  const rows = applyIps
    ? expandByImportanceWeight(dataset, (row) =>
        row.isSynthetic ? 1 : inversePropensityWeight(row),
      )
    : [...dataset];

  const features = rows.map((row) => encodeRow(row, config, now));
  const labels = rows.map(resolveLabel);

  return {
    xs: tf.tensor2d(features),
    ys: tf.tensor2d(labels.map((label) => [label])),
    labels,
  };
}

/**
 * Builds a compact feed-forward model for candidate relevance scoring.
 * Dropout regularises against the expanded synthetic dataset; the wider first
 * layer handles skill diversity.
 */
function buildModel(inputDim: number): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [inputDim],
        units: 64,
        activation: "relu",
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 32, activation: "relu" }),
      tf.layers.dropout({ rate: 0.1 }),
      tf.layers.dense({ units: 1, activation: "sigmoid" }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["mse", "mae"],
  });

  return model;
}

function modelInputDimension(model: tf.LayersModel): number | null {
  const shape = model.inputs[0]?.shape;
  const dim = shape?.[1];
  return typeof dim === "number" ? dim : null;
}

/**
 * The vocabulary a warm-start MUST reuse.
 *
 * Warm-starting used to rebuild the preprocessing config from the *current*
 * dataset every run. The vocabulary order therefore changed between runs, and
 * the loaded weights — which are bound to feature *positions* — landed on a
 * permuted feature space. The model kept training, the loss kept going down,
 * and every learned association was scrambled. Reuse the persisted config or
 * cold-start; there is no third option that is correct.
 */
async function loadPersistedConfig(
  modelDir: string,
): Promise<PreprocessingConfig | null> {
  try {
    const raw = await readFile(path.join(modelDir, "preprocessing.json"), "utf-8");
    return preprocessingConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadWarmStartModel(
  modelDir: string,
): Promise<tf.LayersModel | null> {
  try {
    return await tf.loadLayersModel(`file://${modelDir}/model.json`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

async function trainModel(
  mode: TrainMode,
  dataset: ResumeTrainingRow[],
  now: number,
): Promise<{ version: string; samples: number }> {
  const { current: currentVersion, next: nextVersion } = resolveNextVersion(
    await readCurrentVersion(),
    await listExistingVersions(),
  );
  const currentModelDir = path.join(modelsDir, currentVersion);
  const newModelDir = path.join(modelsDir, nextVersion);

  // Warm-start is only attempted when BOTH the weights and the exact vocabulary
  // they were trained against are available.
  const persistedConfig =
    mode === "incremental" ? await loadPersistedConfig(currentModelDir) : null;

  const reusableConfig =
    persistedConfig && persistedConfig.version === PREPROCESSING_VERSION
      ? persistedConfig
      : null;

  let preprocessingConfig: PreprocessingConfig;

  if (reusableConfig) {
    preprocessingConfig = reusableConfig;
    console.log(
      `[training] Reusing persisted vocabulary from ${currentVersion} (${reusableConfig.knownSkills.length} skills)`,
    );
  } else {
    const built = buildVocabularyFromDataset(dataset);
    preprocessingConfig = built.config;

    const droppedTotal =
      built.dropped.skills.length +
      built.dropped.titles.length +
      built.dropped.locations.length +
      built.dropped.languages.length +
      built.dropped.noticePeriods.length;

    if (droppedTotal > 0) {
      console.warn(
        `[training] Vocabulary truncated: dropped ${built.dropped.skills.length} skills, ` +
          `${built.dropped.titles.length} titles, ${built.dropped.locations.length} locations, ` +
          `${built.dropped.languages.length} languages, ${built.dropped.noticePeriods.length} notice periods.`,
      );
      console.warn(
        `[training] Dropped skills: ${built.dropped.skills.slice(0, 20).join(", ")}${built.dropped.skills.length > 20 ? " …" : ""}`,
      );
    }
  }

  // Temporal split, shared cutoff, with an embargo gap. A random split would
  // train on the future and report a number nobody can reproduce in production.
  const split = temporalSplit(dataset);
  console.log(
    `[training] Split: ${split.train.length} train / ${split.holdout.length} holdout / ${split.embargoed} embargoed (cutoff ${split.cutoff?.toISOString() ?? "n/a"})`,
  );

  const train = buildTrainingMatrices(
    split.train,
    preprocessingConfig,
    now,
    true,
  );
  const holdout =
    split.holdout.length > 0
      ? buildTrainingMatrices(split.holdout, preprocessingConfig, now, false)
      : null;

  const inputDim = train.xs.shape[1];

  let model: tf.LayersModel | null = null;
  let warmStarted = false;

  if (mode === "incremental") {
    const candidate = reusableConfig
      ? await loadWarmStartModel(currentModelDir)
      : null;

    const decision = decideWarmStart({
      mode,
      persistedConfig,
      loadedInputDim: candidate ? modelInputDimension(candidate) : null,
      dataInputDim: inputDim,
    });

    if (decision.warmStart && candidate) {
      (candidate as tf.Sequential).compile({
        optimizer: tf.train.adam(0.0005),
        loss: "binaryCrossentropy",
        metrics: ["mse", "mae"],
      });
      model = candidate;
      warmStarted = true;
      console.log(
        `[training] Warm-start from ${currentVersion}, fine-tuning for ${nextVersion}`,
      );
    } else {
      // This whole decision used to live inside a `try/catch` that only wrapped
      // `loadLayersModel` + `compile`, with `model.fit` outside it — so an
      // incompatible artifact killed the run instead of cold-starting.
      candidate?.dispose();
      console.warn(
        `[training] Cold-starting: ${decision.reason}${"detail" in decision && decision.detail ? ` (${decision.detail})` : ""}`,
      );
    }
  }

  model ??= buildModel(inputDim);

  await model.fit(train.xs, train.ys, {
    epochs: mode === "incremental" ? 20 : 80,
    batchSize: 16,
    shuffle: true,
    ...(holdout ? { validationData: [holdout.xs, holdout.ys] } : {}),
    verbose: 1,
  });

  const calibration = holdout ? await reportCalibration(model, holdout) : null;

  await mkdir(newModelDir, { recursive: true });
  await model.save(`file://${newModelDir}`);

  await writeFile(
    path.join(newModelDir, "preprocessing.json"),
    JSON.stringify(preprocessingConfig, null, 2),
    "utf-8",
  );

  await writeFile(
    path.join(newModelDir, "model-metadata.json"),
    JSON.stringify(
      {
        version: nextVersion,
        trainedAt: new Date(now).toISOString(),
        mode,
        samples: dataset.length,
        trainSamples: split.train.length,
        holdoutSamples: split.holdout.length,
        inputDimension: inputDim,
        queryAware: true,
        preprocessingVersion: PREPROCESSING_VERSION,
        matchMetric: MATCH_METRIC_ID,
        warmStartedFrom: warmStarted ? currentVersion : null,
        calibration,
      },
      null,
      2,
    ),
    "utf-8",
  );

  train.xs.dispose();
  train.ys.dispose();
  holdout?.xs.dispose();
  holdout?.ys.dispose();
  model.dispose();

  return { version: nextVersion, samples: dataset.length };
}

async function reportCalibration(model: tf.LayersModel, holdout: Matrices) {
  const output = model.predict(holdout.xs) as tf.Tensor;
  const predictions = Array.from(await output.data());
  output.dispose();

  const report = buildCalibrationReport(predictions, holdout.labels);
  const gates = evaluateCalibrationGates(report);

  console.log(
    `[training] Calibration on ${report.count} held-out rows: ` +
      `Brier ${report.brier.toFixed(4)}, BSS ${report.brierSkill.toFixed(4)}, ` +
      `ECE ${report.ece.toFixed(4)}, MCE ${report.mce.toFixed(4)}`,
  );

  if (gates.skipped) {
    console.warn(
      "[training] Calibration gate skipped — held-out split too small to judge.",
    );
  } else if (!gates.passed) {
    // Loud, and it fails the run: a miscalibrated model still ranks, but the
    // percentage on the card is the product.
    for (const failure of gates.failures) {
      console.error(`[training] GATE FAILED: ${failure}`);
    }
    throw new Error(
      `Calibration gates failed: ${gates.failures.join(" | ")}`,
    );
  }

  return {
    count: report.count,
    brier: report.brier,
    brierSkill: report.brierSkill,
    ece: report.ece,
    mce: report.mce,
  };
}

function buildVocabularyFromDataset(dataset: readonly ResumeTrainingRow[]) {
  const knownLocations = dataset
    .map((row) => row.location ?? "")
    .filter((value) => value.trim().length > 0);
  // Vocabulary must also cover skills/titles that only appear in work history or
  // in post tags, otherwise a stack used on the job but not self-declared would
  // be invisible to the encoder.
  const knownSkills = dataset.flatMap((row) => [
    ...row.skills,
    ...row.workExperiences.flatMap((experience) => experience.mainStack),
    ...row.posts.flatMap((post) => post.tags),
  ]);
  const knownTitles = dataset.flatMap((row) => [
    ...row.titles,
    ...row.workExperiences
      .map((experience) => experience.title)
      .filter((value): value is string => Boolean(value && value.trim())),
  ]);
  const knownLanguages = dataset.flatMap((row) => row.spokenLanguages);
  const knownNoticePeriods = dataset
    .map((row) => row.noticePeriod ?? "")
    .filter((value) => value.trim().length > 0);

  return buildPreprocessingVocabulary(
    knownLocations,
    knownSkills,
    knownTitles,
    knownLanguages,
    knownNoticePeriods,
    // The synthetic blueprint terms are reserved: they are what every generated
    // positive AND negative is built from, so losing them to truncation makes
    // those two classes indistinguishable.
    blueprintVocabulary(),
  );
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const mode = parseMode();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to train the model");
  }

  const lastRun = await readState();
  if (lastRun) {
    console.log(`[training] Previous run: ${lastRun.lastTrainingAt}`);
  }

  // Captured before a single row is read. Everything written after this instant
  // belongs to the next run.
  const cutoff = new Date();
  const sqlClient = postgres(databaseUrl, { max: 1 });

  try {
    const loadedDataset = await loadDataset(sqlClient, mode, cutoff);
    const dataset = enrichDatasetWithSyntheticRows(loadedDataset, {
      minimumSynthetic: SYNTHETIC_FLOOR[mode],
      ratioToReal: SYNTHETIC_RATIO_TO_REAL,
      now: cutoff.getTime(),
    });

    if (dataset.length < 20) {
      throw new Error(
        `Not enough training data. Expected at least 20 rows, received ${dataset.length}.`,
      );
    }

    const { version } = await trainModel(mode, dataset, cutoff.getTime());

    // Mark interactions as trained ONLY after the model has been saved, and only
    // those that existed when loading started — anything recorded during the run
    // stays untrained instead of being consumed without being read.
    if (mode === "incremental") {
      await sqlClient`
        UPDATE candidate_interactions
        SET trained_at = NOW()
        WHERE trained_at IS NULL
          AND created_at <= ${cutoff}
      `;
    }

    // Update latest.json so the browser worker picks up the new version.
    await writeLatestJson(version);
    await writeState({ lastTrainingAt: new Date().toISOString() });

    console.log(
      `[training] Done. mode=${mode} samples=${dataset.length} output=${version} preprocessing=${PREPROCESSING_VERSION}`,
    );
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

// `import.meta.url` guard so the module can be imported by tests without
// connecting to Postgres and training a model as a side effect.
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error("[training] Failed", error);
    process.exit(1);
  });
}

export { buildTrainingMatrices, buildVocabularyFromDataset, loadDataset, main };
