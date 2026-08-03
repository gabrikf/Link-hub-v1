import { describe, expect, it } from "vitest";
import {
  CALIBRATION_GATES,
  buildCalibrationReport,
  evaluateCalibrationGates,
} from "./quality-gates.js";

/** Deterministic pseudo-random labels so the gates are reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Predictions that are honest: p is genuinely the frequency of a 1. */
function wellCalibrated(count: number) {
  const random = seeded(7);
  const predictions: number[] = [];
  const labels: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const p = random();
    predictions.push(p);
    labels.push(random() < p ? 1 : 0);
  }

  return { predictions, labels };
}

describe("buildCalibrationReport", () => {
  it("reports a well-calibrated model as skilful and low-error", () => {
    const { predictions, labels } = wellCalibrated(2000);
    const report = buildCalibrationReport(predictions, labels);

    expect(report.count).toBe(2000);
    expect(report.brierSkill).toBeGreaterThan(0);
    expect(report.ece).toBeLessThan(0.1);
    expect(report.bins.length).toBeGreaterThan(0);
  });

  it("catches the failure mode that ranking metrics cannot see", () => {
    // Perfect ORDER, useless numbers: every prediction is crammed into
    // [0.90, 0.95] while half the labels are 0. Any nDCG or MRR test passes
    // this model with full marks. The product shows the percentage.
    const predictions: number[] = [];
    const labels: number[] = [];

    for (let index = 0; index < 400; index += 1) {
      const isPositive = index % 2 === 0;
      labels.push(isPositive ? 1 : 0);
      predictions.push(isPositive ? 0.95 : 0.9);
    }

    const report = buildCalibrationReport(predictions, labels);
    const gates = evaluateCalibrationGates(report);

    expect(report.ece).toBeGreaterThan(CALIBRATION_GATES.maxExpectedCalibrationError);
    expect(gates.passed).toBe(false);
    expect(gates.skipped).toBe(false);
    expect(gates.failures.join(" ")).toContain("calibration error");
  });

  it("fails a model that is worse than predicting the base rate", () => {
    // Deliberately inverted: confident and wrong.
    const labels = Array.from({ length: 200 }, (_, index) =>
      index % 2 === 0 ? 1 : 0,
    );
    const predictions = labels.map((label) => (label === 1 ? 0.05 : 0.95));

    const report = buildCalibrationReport(predictions, labels);
    const gates = evaluateCalibrationGates(report);

    expect(report.brierSkill).toBeLessThan(0);
    expect(gates.passed).toBe(false);
    expect(gates.failures.join(" ")).toContain("Brier skill");
  });

  it("passes a well-calibrated model", () => {
    const { predictions, labels } = wellCalibrated(2000);
    const gates = evaluateCalibrationGates(
      buildCalibrationReport(predictions, labels),
    );

    expect(gates).toEqual({ passed: true, skipped: false, failures: [] });
  });
});

describe("gate skipping", () => {
  it("skips rather than passing when the held-out split is too small to judge", () => {
    // "Not enough data to tell" must be distinguishable from "measured and
    // fine", or a pipeline with three held-out rows reports a green gate.
    const report = buildCalibrationReport([0.9, 0.1], [0, 1]);
    const gates = evaluateCalibrationGates(report);

    expect(report.count).toBeLessThan(CALIBRATION_GATES.minSamples);
    expect(gates.skipped).toBe(true);
    expect(gates.passed).toBe(true);
  });

  it("does not skip once the split is large enough", () => {
    const { predictions, labels } = wellCalibrated(
      CALIBRATION_GATES.minSamples + 1,
    );
    expect(
      evaluateCalibrationGates(buildCalibrationReport(predictions, labels))
        .skipped,
    ).toBe(false);
  });
});
