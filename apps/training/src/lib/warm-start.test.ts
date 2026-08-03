import { PREPROCESSING_VERSION, type PreprocessingConfig } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { decideWarmStart } from "./warm-start.js";

function config(version: string): PreprocessingConfig {
  return {
    version,
    maxYearsExperience: 25,
    maxSalaryExpectation: 300000,
    maxLanguageCount: 6,
    maxWorkExperienceCount: 6,
    knownLocations: [],
    knownSkills: ["react"],
    knownTitles: [],
    knownLanguages: [],
    knownNoticePeriods: [],
    seniorityCategories: ["mid"],
    workModelCategories: ["remote"],
    contractTypeCategories: ["full-time"],
  };
}

describe("F6 — an incompatible artifact cold-starts instead of crashing", () => {
  it("cold-starts when the input dimension changed", () => {
    // v1 on disk declares `inputDimension: 125`, v2 declares 130, so this path
    // was live. The old `try/catch` only wrapped `loadLayersModel` + `compile`;
    // `model.fit` sat outside it, so a changed width killed the entire run.
    const decision = decideWarmStart({
      mode: "incremental",
      persistedConfig: config(PREPROCESSING_VERSION),
      loadedInputDim: 125,
      dataInputDim: 136,
    });

    expect(decision.warmStart).toBe(false);
    expect(decision).toMatchObject({ reason: "input-dimension-changed" });
    expect("detail" in decision && decision.detail).toContain("125");
  });

  it("cold-starts when the persisted vocabulary is from another version", () => {
    // The subtler half of F6: the config used to be rebuilt from the current
    // dataset every run, so warm-started weights — bound to feature POSITIONS —
    // landed on a permuted feature space. Loss still fell; the associations
    // were scrambled.
    const decision = decideWarmStart({
      mode: "incremental",
      persistedConfig: config("v1"),
      loadedInputDim: 136,
      dataInputDim: 136,
    });

    expect(decision.warmStart).toBe(false);
    expect(decision).toMatchObject({
      reason: "incompatible-preprocessing-version",
    });
  });

  it("cold-starts when no vocabulary was persisted alongside the weights", () => {
    expect(
      decideWarmStart({
        mode: "incremental",
        persistedConfig: null,
        loadedInputDim: 136,
        dataInputDim: 136,
      }),
    ).toMatchObject({ warmStart: false, reason: "missing-config" });
  });

  it("cold-starts when the model file could not be loaded", () => {
    expect(
      decideWarmStart({
        mode: "incremental",
        persistedConfig: config(PREPROCESSING_VERSION),
        loadedInputDim: null,
        dataInputDim: 136,
      }),
    ).toMatchObject({ warmStart: false, reason: "missing-model" });
  });

  it("warm-starts only when the vocabulary AND the width both match", () => {
    expect(
      decideWarmStart({
        mode: "incremental",
        persistedConfig: config(PREPROCESSING_VERSION),
        loadedInputDim: 136,
        dataInputDim: 136,
      }),
    ).toEqual({ warmStart: true, reason: "compatible" });
  });

  it("never warm-starts an initial run", () => {
    expect(
      decideWarmStart({
        mode: "initial",
        persistedConfig: config(PREPROCESSING_VERSION),
        loadedInputDim: 136,
        dataInputDim: 136,
      }),
    ).toMatchObject({ warmStart: false, reason: "cold-start-requested" });
  });
});
