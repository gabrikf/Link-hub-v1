/**
 * Model scoring smoke tests.
 *
 * Each test loads the current production model (v1) from disk and runs the same
 * feature-encoding path that the browser worker uses (`toQueryCandidateFeatureVector`
 * + `model.predict`). Three candidate tiers are tested against a Fullstack
 * React/Node.js recruiter query:
 *
 *   • perfect  → raw model score ≥ 0.90
 *   • medium   → raw model score between 0.35 and 0.75
 *   • bad      → raw model score ≤ 0.10
 */

import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import {
  PREPROCESSING_VERSION,
  assertPreprocessingCompatible,
  toQueryCandidateFeatureVector,
  preprocessingConfigSchema,
  type PreprocessingConfig,
  type CandidateFeaturesInput,
  type PostFeature,
} from "@repo/schemas";

/**
 * Pinned clock. Post recency is a real feature now, so a floating `Date.now()`
 * would make every score in this file drift by a little every day.
 */
const NOW = Date.UTC(2026, 6, 1);

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../../");
const modelsDir = path.join(rootDir, "apps/web/public/ai-models");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveModelVersion(): Promise<string> {
  const raw = await readFile(path.join(modelsDir, "latest.json"), "utf-8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "v1";
}

async function loadModel(): Promise<tf.LayersModel> {
  const version = await resolveModelVersion();
  return tf.loadLayersModel(`file://${modelsDir}/${version}/model.json`);
}

async function loadPreprocessing(): Promise<PreprocessingConfig> {
  const version = await resolveModelVersion();
  const raw = await readFile(
    path.join(modelsDir, `${version}/preprocessing.json`),
    "utf-8",
  );
  return preprocessingConfigSchema.parse(JSON.parse(raw));
}

/** Runs the exact same encode→predict pipeline the browser worker uses. */
function predict(
  model: tf.LayersModel,
  preprocessing: PreprocessingConfig,
  queryText: string,
  candidate: CandidateFeaturesInput,
): number {
  const vector = toQueryCandidateFeatureVector(
    { queryText, candidate },
    preprocessing,
    { now: NOW },
  );
  const tensor = tf.tensor2d([vector]);
  const output = model.predict(tensor) as tf.Tensor;
  const score = (output.dataSync() as Float32Array)[0] ?? 0;
  tensor.dispose();
  output.dispose();
  return score;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/**
 * Semantic query built by the LLM — mirrors what the backend sends back
 * in `response.input.semanticQuery` for a "Fullstack React + Node.js" search.
 */
const RECRUITER_QUERY = [
  "Role: Fullstack Engineer",
  "Seniority: Mid, 4+ years",
  "Core Skills: React, Node.js, TypeScript, PostgreSQL",
  "Titles: Fullstack Engineer, Software Engineer",
  "Work Model: Remote",
  "Experience: 4+ years",
].join("\n");

// ---------------------------------------------------------------------------
// Candidate fixtures
// ---------------------------------------------------------------------------

const PERFECT_POSTS: PostFeature[] = [
  {
    title: "Shipping React in production",
    excerpt: "Notes from building with react, node.js and typescript.",
    source: "commit",
    tags: ["react", "node.js"],
    publishedAt: daysAgo(20),
  },
  {
    title: "Docker for Node apps",
    excerpt: "How we containerised our node.js services with docker.",
    source: "commit",
    tags: ["node.js", "docker"],
    publishedAt: daysAgo(35),
  },
  {
    title: "PostgreSQL tuning",
    excerpt: "What actually moved the needle on our postgresql queries.",
    source: "manual",
    tags: ["postgresql"],
    publishedAt: daysAgo(50),
  },
];

/**
 * PERFECT candidate: exact skill + title overlap, matching seniority,
 * work model, experience range, and published proof of shipped work.
 * Should score ≥ 0.90.
 */
const PERFECT_CANDIDATE: CandidateFeaturesInput = {
  headlineTitle: "Fullstack Engineer — React and Node.js",
  summary:
    "Delivers full-cycle product features from REST APIs to React UIs. Comfortable owning both sides of the stack.",
  totalYearsExperience: 6,
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
  workExperiences: [
    {
      title: "Fullstack Engineer",
      companyName: "Nubank",
      description:
        "Built customer-facing features end to end with React and Node.js.",
      mainStack: ["React", "Node.js", "TypeScript", "PostgreSQL"],
    },
    {
      title: "Software Engineer",
      companyName: "iFood",
      description: "Shipped REST APIs and React UIs for high-traffic flows.",
      mainStack: ["Node.js", "React", "Docker"],
    },
  ],
  // Since preprocessing v3, "perfect" includes published evidence of shipped
  // work. Commit-sourced posts are written straight from commit history, which
  // makes them the least gameable thing on a profile.
  posts: PERFECT_POSTS,
};

/**
 * MEDIUM candidate: genuine partial fit — shares React + Node.js (but not the
 * full stack), holds a matching "Software Engineer" title, and has real but
 * partial work history. Should score 0.35–0.75.
 */
const MEDIUM_CANDIDATE: CandidateFeaturesInput = {
  headlineTitle: "Software Engineer",
  summary: "Builds React UIs and Node.js APIs across product teams.",
  totalYearsExperience: 4,
  seniorityLevel: "mid",
  workModel: "remote",
  contractType: "full-time",
  location: "rio de janeiro",
  spokenLanguages: ["portuguese"],
  noticePeriod: "15 days",
  openToRelocation: false,
  salaryExpectationMin: 80000,
  salaryExpectationMax: 120000,
  skills: ["React", "Node.js", "JavaScript"],
  titles: ["Software Engineer"],
  workExperiences: [
    {
      title: "Software Engineer",
      companyName: "Globo",
      description: "Built React UIs and Node.js services for product teams.",
      mainStack: ["React", "Node.js"],
    },
  ],
};

/**
 * BAD candidate: completely different stack, no matching skills or titles,
 * unrelated domain. Should score ≤ 0.10.
 */
const BAD_CANDIDATE: CandidateFeaturesInput = {
  headlineTitle: "Swift iOS Engineer",
  summary:
    "Builds polished native iOS apps with SwiftUI and Core Data integrations.",
  totalYearsExperience: 9,
  seniorityLevel: "senior",
  workModel: "on-site",
  contractType: "freelance",
  location: "toronto",
  spokenLanguages: ["english"],
  noticePeriod: "60 days",
  openToRelocation: false,
  salaryExpectationMin: 150000,
  salaryExpectationMax: 220000,
  skills: ["Swift", "SwiftUI", "Xcode", "Core Data", "UIKit"],
  titles: ["Mobile Engineer", "iOS Developer"],
  workExperiences: [
    {
      title: "iOS Developer",
      companyName: "Apple",
      description: "Built native iOS apps with SwiftUI and Core Data.",
      mainStack: ["Swift", "SwiftUI", "Xcode", "Core Data"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Model scoring — Fullstack React/Node.js query", () => {
  let model: tf.LayersModel;
  let preprocessing: PreprocessingConfig;

  beforeAll(async () => {
    [model, preprocessing] = await Promise.all([
      loadModel(),
      loadPreprocessing(),
    ]);
  });

  it("perfect candidate scores ≥ 0.90", () => {
    const score = predict(
      model,
      preprocessing,
      RECRUITER_QUERY,
      PERFECT_CANDIDATE,
    );
    console.log(`  perfect  → ${(score * 100).toFixed(1)}%`);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("medium candidate scores between 0.35 and 0.75", () => {
    const score = predict(
      model,
      preprocessing,
      RECRUITER_QUERY,
      MEDIUM_CANDIDATE,
    );
    console.log(`  medium   → ${(score * 100).toFixed(1)}%`);
    expect(score).toBeGreaterThanOrEqual(0.35);
    expect(score).toBeLessThanOrEqual(0.75);
  });

  it("bad candidate scores ≤ 0.10", () => {
    const score = predict(model, preprocessing, RECRUITER_QUERY, BAD_CANDIDATE);
    console.log(`  bad      → ${(score * 100).toFixed(1)}%`);
    expect(score).toBeLessThanOrEqual(0.1);
  });
});

describe("Shipped model artifacts", () => {
  let model: tf.LayersModel;
  let preprocessing: PreprocessingConfig;

  beforeAll(async () => {
    [model, preprocessing] = await Promise.all([
      loadModel(),
      loadPreprocessing(),
    ]);
  });

  it("are built against the preprocessing version this code encodes with", () => {
    // The loudest possible failure for a stale artifact. Before this, a config
    // from an older version parsed cleanly (its `version` was only ever
    // `z.string()`) and the mismatch surfaced as a dimension error deep inside
    // TensorFlow — or not at all, if the widths happened to line up.
    expect(preprocessing.version).toBe(PREPROCESSING_VERSION);

    const inputDim = model.inputs[0]?.shape?.[1];
    expect(typeof inputDim).toBe("number");
    expect(() =>
      assertPreprocessingCompatible(preprocessing, inputDim as number),
    ).not.toThrow();
  });

  it("reserved the synthetic blueprint vocabulary instead of truncating it", () => {
    // Once ~25-30 real resumes existed, React/Node/TypeScript used to fall off
    // the end of the 160-slot skill list — and the synthetic positives and
    // negatives, built entirely from those skills, became near-identical
    // vectors carrying opposite labels.
    for (const skill of ["react", "node.js", "typescript"]) {
      expect(preprocessing.knownSkills).toContain(skill);
    }
  });
});

describe("Post evidence changes the score", () => {
  let model: tf.LayersModel;
  let preprocessing: PreprocessingConfig;

  beforeAll(async () => {
    [model, preprocessing] = await Promise.all([
      loadModel(),
      loadPreprocessing(),
    ]);
  });

  it("scores a candidate with relevant shipped work above the same candidate without it", () => {
    // Guards against the post features being present in the vector but inert —
    // which is exactly what happened at serve time while the worker dropped
    // `workEvidence` on the floor.
    const withPosts = predict(
      model,
      preprocessing,
      RECRUITER_QUERY,
      PERFECT_CANDIDATE,
    );
    const withoutPosts = predict(model, preprocessing, RECRUITER_QUERY, {
      ...PERFECT_CANDIDATE,
      posts: [],
    });

    expect(withPosts).toBeGreaterThan(withoutPosts);
  });
});
