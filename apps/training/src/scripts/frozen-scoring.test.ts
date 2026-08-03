/**
 * Frozen scoring fixture.
 *
 * 48 committed (query, candidate) → featureVector → score triples, asserted to
 * ±1e-3. This is the only test here that catches SILENT drift: a reordered
 * vocabulary, an accidentally-reordered feature, a retrained model quietly
 * committed, a changed default in the encoder. None of those move a ranking
 * metric enough to fail an assertion about ordering — every candidate shifts
 * together, so the order survives and the numbers on the cards are all wrong.
 *
 * If this fails and you did not intend to change anything, do not regenerate
 * the fixture. Find out what moved.
 *
 * Intentional changes: `npx tsx src/scripts/generate-scoring-fixture.mts`
 */
import "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PREPROCESSING_VERSION,
  preprocessingConfigSchema,
  toQueryCandidateFeatureVector,
  type PreprocessingConfig,
} from "@repo/schemas";
import {
  FIXTURE_NOW,
  buildFixtureCases,
  fixturePath,
  modelsDir,
} from "../lib/scoring-fixture.js";

const TOLERANCE = 1e-3;

interface FrozenFixture {
  modelVersion: string;
  preprocessingVersion: string;
  now: number;
  cases: Array<{ id: string; vector: number[]; score: number }>;
}

let fixture: FrozenFixture;
let model: tf.LayersModel;
let preprocessing: PreprocessingConfig;
let shippedVersion: string;

beforeAll(async () => {
  fixture = JSON.parse(await readFile(fixturePath, "utf-8")) as FrozenFixture;

  shippedVersion =
    (
      JSON.parse(
        await readFile(path.join(modelsDir, "latest.json"), "utf-8"),
      ) as { version?: string }
    ).version ?? "v1";

  [model, preprocessing] = await Promise.all([
    tf.loadLayersModel(`file://${modelsDir}/${shippedVersion}/model.json`),
    readFile(
      path.join(modelsDir, shippedVersion, "preprocessing.json"),
      "utf-8",
    ).then((raw) => preprocessingConfigSchema.parse(JSON.parse(raw))),
  ]);
});

describe("frozen scoring fixture", () => {
  it("was captured against the artifacts currently shipped", () => {
    expect(fixture.preprocessingVersion).toBe(PREPROCESSING_VERSION);
    expect(fixture.modelVersion).toBe(shippedVersion);
    expect(fixture.now).toBe(FIXTURE_NOW);
  });

  it("covers a real spread of scores, not one saturated value", () => {
    // Without this the whole file could pass vacuously the day the model
    // collapses to predicting a constant — which is exactly what F7 caused.
    const scores = fixture.cases.map((testCase) => testCase.score);

    expect(scores.length).toBeGreaterThanOrEqual(45);
    expect(Math.min(...scores)).toBeLessThan(0.2);
    expect(Math.max(...scores)).toBeGreaterThan(0.8);
  });

  it("re-encodes every case to the exact vector that was committed", () => {
    // Catches preprocessing drift specifically: a changed vocabulary order or a
    // reordered feature changes the vector while leaving the model untouched.
    const cases = buildFixtureCases();
    expect(cases).toHaveLength(fixture.cases.length);

    for (const [index, testCase] of cases.entries()) {
      const frozen = fixture.cases[index]!;
      expect(frozen.id).toBe(testCase.id);

      const vector = toQueryCandidateFeatureVector(
        { queryText: testCase.queryText, candidate: testCase.candidate },
        preprocessing,
        { now: FIXTURE_NOW },
      );

      expect(vector).toHaveLength(frozen.vector.length);
      for (const [position, value] of vector.entries()) {
        expect(
          Math.abs(value - frozen.vector[position]!),
          `case ${frozen.id}, feature ${position}`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });

  it("predicts every committed vector to within 1e-3", () => {
    const tensor = tf.tensor2d(
      fixture.cases.map((testCase) => testCase.vector),
    );
    const output = model.predict(tensor) as tf.Tensor;
    const predictions = Array.from(output.dataSync());
    tensor.dispose();
    output.dispose();

    expect(predictions).toHaveLength(fixture.cases.length);

    for (const [index, testCase] of fixture.cases.entries()) {
      expect(
        Math.abs(predictions[index]! - testCase.score),
        `case ${testCase.id}`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("ranks a matching candidate above a mismatched one for the same query", () => {
    // A sanity check that the frozen numbers still mean what their ids say —
    // if the fixture were regenerated from a broken model, the assertions above
    // would happily lock the breakage in. This one would not.
    const byId = new Map(
      fixture.cases.map((testCase) => [testCase.id, testCase.score]),
    );

    let compared = 0;
    for (const [id, score] of byId) {
      if (!id.endsWith("-strong")) {
        continue;
      }
      const mismatch = byId.get(id.replace("-strong", "-mismatch"));
      if (mismatch === undefined) {
        continue;
      }
      compared += 1;
      expect(score, `blueprint ${id}`).toBeGreaterThan(mismatch);
    }

    expect(compared).toBeGreaterThanOrEqual(15);
  });
});
