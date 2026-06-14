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
  toQueryCandidateFeatureVector,
  preprocessingConfigSchema,
  type PreprocessingConfig,
  type CandidateFeaturesInput,
} from "@repo/schemas";

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

/**
 * PERFECT candidate: exact skill + title overlap, matching seniority,
 * work model, and experience range. Should score ≥ 0.90.
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
