import "dotenv/config";
import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import postgres from "postgres";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDefaultPreprocessingConfig,
  toQueryCandidateFeatureVector,
  type PreprocessingConfig,
} from "@repo/schemas";
import { fileURLToPath } from "node:url";
import type {
  ResumeTrainingRow,
  TrainingState,
} from "../lib/training-types.js";

type TrainMode = "initial" | "incremental";
type CandidateQuality = "perfect" | "strong" | "medium" | "weak";

interface TrainingBlueprint {
  headline: string;
  summary: string;
  seniorityLevel: string;
  workModel: string;
  contractType: string;
  location: string;
  spokenLanguages: readonly string[];
  noticePeriod: string;
  openToRelocation: boolean;
  salaryExpectationMin: number;
  salaryExpectationMax: number;
  skills: readonly string[];
  titles: readonly string[];
  minYears: number;
  maxYears: number;
  baseInteraction: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../../");
const modelsDir = path.join(rootDir, "apps/web/public/ai-models");
const latestJsonPath = path.join(modelsDir, "latest.json");
const trainingStatePath = path.join(
  rootDir,
  "apps/training/.cache/last-training.json",
);
const INITIAL_SYNTHETIC_TARGET = 720;
const INCREMENTAL_SYNTHETIC_TARGET = 180;

const MATCH_WEIGHTS = {
  skills: 4,
  titles: 3,
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

const SYNTHETIC_STACKS: readonly TrainingBlueprint[] = [
  {
    headline: "Senior Node.js Backend Engineer",
    summary: "Designs scalable APIs and distributed systems.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 120000,
    salaryExpectationMax: 180000,
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Kafka"],
    titles: ["Backend Engineer", "Software Engineer"],
    minYears: 6,
    maxYears: 12,
    baseInteraction: 1.25,
  },
  {
    headline: "React Frontend Engineer",
    summary: "Builds component systems and performant web apps.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "full-time",
    location: "rio de janeiro",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "15 days",
    openToRelocation: false,
    salaryExpectationMin: 90000,
    salaryExpectationMax: 140000,
    skills: ["React", "TypeScript", "Vite", "Tailwind CSS", "Testing Library"],
    titles: ["Frontend Engineer", "React Developer"],
    minYears: 3,
    maxYears: 8,
    baseInteraction: 0.95,
  },
  {
    headline: "Fullstack Engineer — React and Node.js",
    summary: "Delivers end-to-end features across web UI and REST APIs.",
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 100000,
    salaryExpectationMax: 160000,
    skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
    titles: ["Fullstack Engineer", "Software Engineer"],
    minYears: 4,
    maxYears: 10,
    baseInteraction: 1.15,
  },
  {
    headline: "Senior Fullstack Developer — React and Node.js",
    summary:
      "Leads full-cycle product development from DB schema to UI components.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "belo horizonte",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 130000,
    salaryExpectationMax: 200000,
    skills: [
      "React",
      "Node.js",
      "TypeScript",
      "GraphQL",
      "PostgreSQL",
      "Redis",
    ],
    titles: ["Fullstack Engineer", "Software Engineer", "Tech Lead"],
    minYears: 7,
    maxYears: 14,
    baseInteraction: 1.4,
  },
  {
    headline: "Python Data Engineer",
    summary: "Creates ETL pipelines and ML-ready datasets.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "contract",
    location: "belo horizonte",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 110000,
    salaryExpectationMax: 170000,
    skills: ["Python", "Apache Airflow", "Apache Spark", "SQL", "AWS"],
    titles: ["Data Engineer", "Python Engineer"],
    minYears: 5,
    maxYears: 11,
    baseInteraction: 1.1,
  },
  {
    headline: "C# .NET Backend Developer",
    summary: "Builds enterprise APIs and cloud-native services.",
    seniorityLevel: "mid",
    workModel: "on-site",
    contractType: "clt",
    location: "campinas",
    spokenLanguages: ["portuguese", "english"],
    noticePeriod: "45 days",
    openToRelocation: false,
    salaryExpectationMin: 85000,
    salaryExpectationMax: 145000,
    skills: ["C#", ".NET", "SQL Server", "Azure", "Docker"],
    titles: ["Software Engineer", "Backend Developer"],
    minYears: 4,
    maxYears: 10,
    baseInteraction: 0.9,
  },
  {
    headline: "Java Platform Engineer",
    summary: "Maintains high-throughput microservices architecture.",
    seniorityLevel: "staff",
    workModel: "hybrid",
    contractType: "pj",
    location: "florianopolis",
    spokenLanguages: ["english"],
    noticePeriod: "60 days",
    openToRelocation: true,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 220000,
    skills: ["Java", "Spring Boot", "Kubernetes", "PostgreSQL", "RabbitMQ"],
    titles: ["Platform Engineer", "Software Architect"],
    minYears: 8,
    maxYears: 16,
    baseInteraction: 1.35,
  },
  {
    headline: "DevOps Engineer",
    summary: "Automates delivery and observability across environments.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "freelance",
    location: "curitiba",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "immediate",
    openToRelocation: true,
    salaryExpectationMin: 115000,
    salaryExpectationMax: 190000,
    skills: ["Docker", "Kubernetes", "Terraform", "AWS", "Prometheus"],
    titles: ["DevOps Engineer", "Site Reliability Engineer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.2,
  },
  {
    headline: "Go Backend Engineer",
    summary: "Builds high-performance microservices and CLIs in Go.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "porto alegre",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 125000,
    salaryExpectationMax: 195000,
    skills: ["Go", "gRPC", "PostgreSQL", "Redis", "Kubernetes"],
    titles: ["Backend Engineer", "Software Engineer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.1,
  },
  {
    headline: "Mobile Engineer — Flutter",
    summary: "Ships polished cross-platform apps with Flutter and Dart.",
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "recife",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "15 days",
    openToRelocation: false,
    salaryExpectationMin: 85000,
    salaryExpectationMax: 140000,
    skills: ["Flutter", "Dart", "Firebase", "REST API", "BLoC"],
    titles: ["Mobile Engineer", "Flutter Developer"],
    minYears: 3,
    maxYears: 8,
    baseInteraction: 1.0,
  },
  {
    headline: "Machine Learning Engineer",
    summary: "Trains and deploys ML models for production inference.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "contract",
    location: "sao paulo",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 210000,
    skills: ["Python", "PyTorch", "scikit-learn", "MLflow", "AWS"],
    titles: ["Machine Learning Engineer", "Data Scientist"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.2,
  },
  {
    headline: "QA Automation Engineer",
    summary:
      "Designs test frameworks that catch regressions before production.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "clt",
    location: "belo horizonte",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 75000,
    salaryExpectationMax: 120000,
    skills: ["Cypress", "Playwright", "TypeScript", "Jest", "CI/CD"],
    titles: ["QA Engineer", "Software Engineer in Test"],
    minYears: 3,
    maxYears: 9,
    baseInteraction: 0.85,
  },
  // --- Out-of-domain stacks ---
  // These exist so the vocabulary includes their skills and the cross-blueprint
  // negative generator can produce "Fullstack query + iOS candidate = label 0"
  // training examples, teaching the model that zero skill overlap → bad match.
  {
    headline: "Senior Swift iOS Engineer",
    summary:
      "Builds polished native iOS apps with SwiftUI and Core Data integrations.",
    seniorityLevel: "senior",
    workModel: "on-site",
    contractType: "freelance",
    location: "toronto",
    spokenLanguages: ["english"],
    noticePeriod: "60 days",
    openToRelocation: false,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 210000,
    skills: ["Swift", "SwiftUI", "Xcode", "Core Data", "UIKit"],
    titles: ["iOS Developer", "Mobile Engineer"],
    minYears: 7,
    maxYears: 14,
    baseInteraction: 1.1,
  },
  {
    headline: "Android Kotlin Engineer",
    summary: "Ships robust Android apps with Kotlin and Jetpack Compose.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "clt",
    location: "campinas",
    spokenLanguages: ["portuguese", "english"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 90000,
    salaryExpectationMax: 140000,
    skills: ["Kotlin", "Jetpack Compose", "Android SDK", "Room", "Coroutines"],
    titles: ["Android Developer", "Mobile Engineer"],
    minYears: 3,
    maxYears: 9,
    baseInteraction: 0.95,
  },
  {
    headline: "Elixir Backend Engineer",
    summary:
      "Creates fault-tolerant distributed systems with Elixir and Phoenix.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "berlin",
    spokenLanguages: ["english", "german"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 120000,
    salaryExpectationMax: 180000,
    skills: ["Elixir", "Phoenix", "Erlang", "Ecto", "LiveView"],
    titles: ["Backend Engineer", "Elixir Developer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.05,
  },
] as const;

// Reads the --mode argument to switch between initial and incremental training.
function parseMode(): TrainMode {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  if (!modeArg) {
    return "initial";
  }

  const parsed = modeArg.split("=")[1];
  return parsed === "incremental" ? "incremental" : "initial";
}

// Loads the timestamp of the last successful training run.
async function readState(): Promise<TrainingState | null> {
  try {
    const raw = await readFile(trainingStatePath, "utf-8");
    return JSON.parse(raw) as TrainingState;
  } catch {
    return null;
  }
}

// Persists the timestamp used by incremental training.
async function writeState(state: TrainingState): Promise<void> {
  await mkdir(path.dirname(trainingStatePath), { recursive: true });
  await writeFile(trainingStatePath, JSON.stringify(state, null, 2), "utf-8");
}

// Reads the current version from latest.json and returns the next version string.
async function resolveNextVersion(): Promise<{
  current: string;
  next: string;
}> {
  try {
    const raw = await readFile(latestJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    const current = parsed.version ?? "v1";
    const num = parseInt(current.replace(/^v/, ""), 10);
    const next = `v${Number.isFinite(num) ? num + 1 : 2}`;
    return { current, next };
  } catch {
    return { current: "v1", next: "v2" };
  }
}

// Writes the updated version pointer.
async function writeLatestJson(version: string): Promise<void> {
  await writeFile(
    latestJsonPath,
    JSON.stringify({ version }, null, 2),
    "utf-8",
  );
}

// Fetches training rows from Postgres.
// Initial: rows that have at least one recruiter interaction (interactionScore > 0)
// plus their full profile data.  Zero-interaction rows are excluded because using
// a candidate's own profile as the query with label=0 would teach the model that
// "profile matches itself = bad", which contradicts what the synthetic data teaches.
// Incremental: only rows with trained_at IS NULL, using candidate_snapshot when available.
async function loadDataset(
  sqlClient: postgres.Sql,
  mode: TrainMode,
): Promise<ResumeTrainingRow[]> {
  if (mode === "initial") {
    const rows = await sqlClient<ResumeTrainingRow[]>`
      SELECT
        r.id AS "resumeId",
        MAX(ci.query_text) FILTER (WHERE ci.query_text IS NOT NULL) AS "queryText",
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
        COALESCE(
          ARRAY_AGG(DISTINCT sc.name) FILTER (WHERE sc.name IS NOT NULL),
          ARRAY[]::text[]
        ) AS "skills",
        COALESCE(
          ARRAY_AGG(DISTINCT tc.name) FILTER (WHERE tc.name IS NOT NULL),
          ARRAY[]::text[]
        ) AS "titles",
        COALESCE(SUM(
          CASE
            WHEN ci.interaction_type = 'EMAIL_COPY' THEN 1.0
            WHEN ci.interaction_type = 'CONTACT_CLICK' THEN 1.0
            WHEN ci.interaction_type = 'PROFILE_VIEW' THEN 0.35
            ELSE 0
          END
        ), 0.0) AS "interactionScore"
      FROM resumes r
      LEFT JOIN resume_skills rs ON rs.resume_id = r.id
      LEFT JOIN skills_catalog sc ON sc.id = rs.skill_id
      LEFT JOIN resume_titles rt ON rt.resume_id = r.id
      LEFT JOIN titles_catalog tc ON tc.id = rt.title_id
      LEFT JOIN candidate_interactions ci ON ci.resume_id = r.id
      GROUP BY r.id
      HAVING COALESCE(SUM(
        CASE
          WHEN ci.interaction_type = 'EMAIL_COPY' THEN 1.0
          WHEN ci.interaction_type = 'CONTACT_CLICK' THEN 1.0
          WHEN ci.interaction_type = 'PROFILE_VIEW' THEN 0.35
          ELSE 0
        END
      ), 0.0) > 0
    `;
    return rows;
  }

  // Incremental: build training rows from snapshot data stored at interaction time.
  // This avoids joins and uses the candidate attributes the recruiter actually saw.
  const interactionRows = await sqlClient<
    {
      resumeId: string;
      queryText: string | null;
      querySnapshot: Record<string, unknown> | null;
      candidateSnapshot: Record<string, unknown> | null;
      interactionScore: number;
    }[]
  >`
    SELECT
      resume_id AS "resumeId",
      MAX(query_text) FILTER (WHERE query_text IS NOT NULL) AS "queryText",
      MAX(query_snapshot) FILTER (WHERE query_snapshot IS NOT NULL) AS "querySnapshot",
      MAX(candidate_snapshot) FILTER (WHERE candidate_snapshot IS NOT NULL) AS "candidateSnapshot",
      COALESCE(SUM(
        CASE
          WHEN interaction_type = 'EMAIL_COPY' THEN 1.0
          WHEN interaction_type = 'CONTACT_CLICK' THEN 1.0
          WHEN interaction_type = 'PROFILE_VIEW' THEN 0.35
          ELSE 0
        END
      ), 0.0) AS "interactionScore"
    FROM candidate_interactions
    WHERE trained_at IS NULL
    GROUP BY resume_id
  `;

  return interactionRows.map((row) => {
    const snap = row.candidateSnapshot;
    const qsnap = row.querySnapshot;
    // Prefer the frozen snapshot; fall back to empty defaults for legacy rows.
    return {
      resumeId: row.resumeId,
      queryText:
        (qsnap?.semanticQuery as string | undefined) ?? row.queryText ?? null,
      headlineTitle: (snap?.headlineTitle as string | null) ?? null,
      summary: (snap?.summary as string | null) ?? null,
      totalYearsExperience:
        (snap?.totalYearsExperience as number | null) ?? null,
      seniorityLevel: (snap?.seniorityLevel as string | null) ?? null,
      workModel: (snap?.workModel as string | null) ?? null,
      contractType: (snap?.contractType as string | null) ?? null,
      location: (snap?.location as string | null) ?? null,
      spokenLanguages: (snap?.spokenLanguages as string[]) ?? [],
      noticePeriod: (snap?.noticePeriod as string | null) ?? null,
      openToRelocation: (snap?.openToRelocation as boolean) ?? false,
      salaryExpectationMin:
        (snap?.salaryExpectationMin as number | null) ?? null,
      salaryExpectationMax:
        (snap?.salaryExpectationMax as number | null) ?? null,
      skills: (snap?.skills as string[]) ?? [],
      titles: (snap?.titles as string[]) ?? [],
      interactionScore: row.interactionScore,
    } satisfies ResumeTrainingRow;
  });
}

// Produces an integer in the inclusive [min, max] interval.
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Calculates Jaccard overlap to reward complete and partial set matches.
function setSimilarity(
  expected: readonly string[],
  actual: readonly string[],
): number {
  if (expected.length === 0 && actual.length === 0) {
    return 1;
  }

  const expectedSet = new Set(
    expected.map((value) => value.trim().toLowerCase()),
  );
  const actualSet = new Set(actual.map((value) => value.trim().toLowerCase()));
  const union = new Set([...expectedSet, ...actualSet]);

  if (union.size === 0) {
    return 0;
  }

  const intersectionCount = [...expectedSet].filter((value) =>
    actualSet.has(value),
  ).length;
  return intersectionCount / union.size;
}

// Converts an absolute gap into a similarity score in the [0, 1] interval.
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

// Computes a weighted target score where skills=3x, titles=2x and other signals=1x.
function computeWeightedTarget(
  blueprint: TrainingBlueprint,
  candidate: ResumeTrainingRow,
): number {
  const skillScore = setSimilarity(blueprint.skills, candidate.skills);
  const titleScore = setSimilarity(blueprint.titles, candidate.titles);
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
  const salaryScore = proximityScore(
    salaryCenter,
    candidateSalaryCenter,
    90000,
  );

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
    MATCH_WEIGHTS.skills + MATCH_WEIGHTS.titles + MATCH_WEIGHTS.others;

  return (
    (MATCH_WEIGHTS.skills * skillScore +
      MATCH_WEIGHTS.titles * titleScore +
      MATCH_WEIGHTS.others * othersScore) /
    totalWeight
  );
}

// Creates realistic candidate variations from a role blueprint for supervised learning.
function createCandidateFromBlueprint(
  blueprint: TrainingBlueprint,
  quality: CandidateQuality,
  index: number,
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
    interactionScore: 0,
  };

  // Stores the synthetic label in interactionScore and keeps the existing label pipeline unchanged.
  row.interactionScore = Math.min(2, computeWeightedTarget(blueprint, row) * 2);
  return row;
}

// Generates synthetic supervised examples that include perfect and imperfect candidate matches.
function createSyntheticDataset(count: number): ResumeTrainingRow[] {
  const rows: ResumeTrainingRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const blueprint = SYNTHETIC_STACKS[index % SYNTHETIC_STACKS.length]!;
    const quality = QUALITY_DISTRIBUTION[index % QUALITY_DISTRIBUTION.length]!;
    rows.push(createCandidateFromBlueprint(blueprint, quality, index));
  }

  return rows;
}

// Generates cross-blueprint negative examples: pairs a query from blueprint A
// with a candidate from a distant blueprint B (guaranteed skill mismatch).
// These label=0 examples teach the model what a bad match looks like.
function createCrossBlueprintNegatives(count: number): ResumeTrainingRow[] {
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
      interactionScore: 0, // label = 0: query and candidate are a clear mismatch
    });
  }

  return rows;
}

// Adds synthetic supervision so the model learns explicit expected-candidate quality patterns.
// ~70 % are same-blueprint quality variants (positive signal),
// ~30 % are cross-blueprint negatives (label = 0 mismatch signal).
function enrichDatasetWithSyntheticRows(
  mode: TrainMode,
  dataset: ResumeTrainingRow[],
): ResumeTrainingRow[] {
  const targetSize =
    mode === "initial"
      ? INITIAL_SYNTHETIC_TARGET
      : INCREMENTAL_SYNTHETIC_TARGET;
  const syntheticCount = Math.max(targetSize - dataset.length, 0);

  if (syntheticCount === 0) {
    return dataset;
  }

  const positiveCount = Math.round(syntheticCount * 0.5);
  const negativeCount = syntheticCount - positiveCount;

  return [
    ...dataset,
    ...createSyntheticDataset(positiveCount),
    ...createCrossBlueprintNegatives(negativeCount),
  ];
}

// Converts interaction values to model labels in [0, 1].
function buildLabel(interactionScore: number): number {
  if (interactionScore <= 0) {
    return 0;
  }

  return Math.min(interactionScore / 2, 1);
}

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

// Builds model-ready feature and label tensors from the training rows.
// Shuffles rows first so the validation split (last 20 %) contains a
// representative mix of positives and negatives instead of only one class.
function buildTrainingMatrices(
  dataset: ResumeTrainingRow[],
  config: PreprocessingConfig,
): { xs: tf.Tensor2D; ys: tf.Tensor2D } {
  // Fisher-Yates in-place shuffle so the validationSplit slice is balanced.
  const shuffled = [...dataset];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const features = shuffled.map((row) =>
    // Core pairwise comparison: recruiter input (queryText) x candidate profile.
    toQueryCandidateFeatureVector(
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
        },
      },
      config,
    ),
  );

  const labels = shuffled.map((row) => [buildLabel(row.interactionScore)]);

  return {
    xs: tf.tensor2d(features),
    ys: tf.tensor2d(labels),
  };
}

// Builds a compact feed-forward model for candidate relevance scoring.
// Uses dropout for regularisation to prevent overfitting on the expanded
// synthetic dataset and a larger first layer to handle more skill diversity.
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

// Trains the model, then writes model files and preprocessing metadata for the web worker.
// In incremental mode the existing model weights are loaded first (warm-start),
// so the network continues learning instead of starting from scratch.
async function trainModel(
  mode: TrainMode,
  dataset: ResumeTrainingRow[],
): Promise<string> {
  const { current: currentVersion, next: nextVersion } =
    await resolveNextVersion();
  const currentModelDir = path.join(modelsDir, currentVersion);
  const newModelDir = path.join(modelsDir, nextVersion);

  const knownLocations = dataset
    .map((row) => row.location ?? "")
    .filter((value) => value.trim().length > 0);
  const knownSkills = dataset.flatMap((row) => row.skills);
  const knownTitles = dataset.flatMap((row) => row.titles);
  const knownLanguages = dataset.flatMap((row) => row.spokenLanguages);
  const knownNoticePeriods = dataset
    .map((row) => row.noticePeriod ?? "")
    .filter((value) => value.trim().length > 0);

  const preprocessingConfig = buildDefaultPreprocessingConfig(
    knownLocations,
    knownSkills,
    knownTitles,
    knownLanguages,
    knownNoticePeriods,
  );

  const { xs, ys } = buildTrainingMatrices(dataset, preprocessingConfig);

  let model: tf.LayersModel;

  if (mode === "incremental") {
    // Warm-start: resume training from the existing weights instead of
    // building a new network from scratch (avoids catastrophic forgetting).
    try {
      model = await tf.loadLayersModel(`file://${currentModelDir}/model.json`);
      (model as tf.Sequential).compile({
        optimizer: tf.train.adam(0.0005),
        loss: "binaryCrossentropy",
        metrics: ["mse", "mae"],
      });
      console.log(
        `[training] Warm-start from ${currentVersion}, fine-tuning for ${nextVersion}`,
      );
    } catch {
      console.warn(
        "[training] Could not load existing model, falling back to cold-start",
      );
      model = buildModel(xs.shape[1]);
    }
  } else {
    model = buildModel(xs.shape[1]);
  }

  await model.fit(xs, ys, {
    epochs: mode === "incremental" ? 20 : 80,
    batchSize: 16,
    shuffle: true,
    validationSplit: 0.2,
    verbose: 1,
  });

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
        trainedAt: new Date().toISOString(),
        mode,
        samples: dataset.length,
        inputDimension: xs.shape[1],
        queryAware: true,
      },
      null,
      2,
    ),
    "utf-8",
  );

  xs.dispose();
  ys.dispose();
  model.dispose();

  return nextVersion;
}

// Coordinates dataset loading, enrichment, training, and state persistence.
async function main() {
  const mode = parseMode();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to train the model");
  }

  const sqlClient = postgres(databaseUrl, { max: 1 });

  try {
    const loadedDataset = await loadDataset(sqlClient, mode);
    const dataset = enrichDatasetWithSyntheticRows(mode, loadedDataset);

    if (dataset.length < 20) {
      throw new Error(
        `Not enough training data. Expected at least 20 rows, received ${dataset.length}.`,
      );
    }

    const newVersion = await trainModel(mode, dataset);

    // Mark all used interactions as trained ONLY after the model has been saved
    // successfully, so a failed training run never loses interaction data.
    if (mode === "incremental") {
      await sqlClient`
        UPDATE candidate_interactions
        SET trained_at = NOW()
        WHERE trained_at IS NULL
      `;
    }

    // Update latest.json so the browser worker picks up the new version.
    await writeLatestJson(newVersion);
    await writeState({ lastTrainingAt: new Date().toISOString() });

    console.log(
      `[training] Done. mode=${mode} samples=${dataset.length} output=${newVersion}`,
    );
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[training] Failed", error);
  process.exit(1);
});
