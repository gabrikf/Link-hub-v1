/**
 * Regenerates `src/fixtures/frozen-scoring.json`.
 *
 * Run it ONLY when the shipped model artifacts or the feature encoder change on
 * purpose:
 *
 *   npx tsx src/scripts/generate-scoring-fixture.mts
 *
 * If `frozen-scoring.test.ts` starts failing and you did not intend to change
 * anything, that is the test doing its job — regenerating the fixture to make it
 * pass hides exactly the drift it exists to catch.
 */
import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  PREPROCESSING_VERSION,
  preprocessingConfigSchema,
  toQueryCandidateFeatureVector,
} from "@repo/schemas";
import {
  FIXTURE_NOW,
  buildFixtureCases,
  fixturePath,
  modelsDir,
} from "../lib/scoring-fixture.js";

const version = (
  JSON.parse(await readFile(path.join(modelsDir, "latest.json"), "utf-8")) as {
    version?: string;
  }
).version;

if (!version) {
  throw new Error("latest.json has no version");
}

const model = await tf.loadLayersModel(
  `file://${modelsDir}/${version}/model.json`,
);
const config = preprocessingConfigSchema.parse(
  JSON.parse(
    await readFile(path.join(modelsDir, version, "preprocessing.json"), "utf-8"),
  ),
);

const cases = buildFixtureCases();
const vectors = cases.map((testCase) =>
  toQueryCandidateFeatureVector(
    { queryText: testCase.queryText, candidate: testCase.candidate },
    config,
    { now: FIXTURE_NOW },
  ),
);

const tensor = tf.tensor2d(vectors);
const output = model.predict(tensor) as tf.Tensor;
const scores = Array.from(await output.data());
tensor.dispose();
output.dispose();

await mkdir(path.dirname(fixturePath), { recursive: true });
await writeFile(
  fixturePath,
  `${JSON.stringify(
    {
      modelVersion: version,
      preprocessingVersion: PREPROCESSING_VERSION,
      now: FIXTURE_NOW,
      cases: cases.map((testCase, index) => ({
        id: testCase.id,
        vector: vectors[index]!.map((value) => Number(value.toFixed(9))),
        score: Number(scores[index]!.toFixed(9)),
      })),
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

console.log(
  `Wrote ${cases.length} frozen scoring cases for ${version} to ${fixturePath}`,
);
