import { describe, expect, it } from "vitest";
import {
  brierScore,
  brierSkillScore,
  expectedCalibrationError,
  maximumCalibrationError,
  reliabilityBins,
} from "./calibration.js";

describe("brierScore", () => {
  it("is 0 for a perfectly confident, perfectly correct forecast", () => {
    expect(brierScore([1, 0, 1], [1, 0, 1])).toBe(0);
  });

  it("is 1 for a perfectly confident, perfectly wrong forecast", () => {
    expect(brierScore([1, 0], [0, 1])).toBe(1);
  });

  it("is the mean squared error", () => {
    // ((0.8-1)² + (0.3-0)²) / 2 = (0.04 + 0.09) / 2 = 0.065
    expect(brierScore([0.8, 0.3], [1, 0])).toBeCloseTo(0.065, 10);
  });

  it("scores an always-0.5 forecaster at 0.25", () => {
    expect(brierScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])).toBeCloseTo(0.25, 10);
  });

  it("rejects mismatched lengths rather than silently truncating", () => {
    expect(() => brierScore([0.5], [1, 0])).toThrow(/same length/);
  });

  it("is 0 for empty input", () => {
    expect(brierScore([], [])).toBe(0);
  });
});

describe("brierSkillScore", () => {
  it("is 0 when the model only matches the base rate", () => {
    // 50% base rate; predicting 0.5 for everything is exactly the baseline.
    expect(brierSkillScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])).toBeCloseTo(0, 10);
  });

  it("is 1 for a perfect forecast", () => {
    expect(brierSkillScore([1, 0, 1, 0], [1, 0, 1, 0])).toBeCloseTo(1, 10);
  });

  it("is negative when the model is worse than guessing the base rate", () => {
    expect(brierSkillScore([0.9, 0.9], [1, 0])).toBeLessThan(0);
  });

  it("exposes an imbalanced-data forecaster that raw Brier flatters", () => {
    // 5% positives. Predicting 0.05 everywhere gives Brier ≈ 0.0475, which
    // looks excellent and is worthless — BSS correctly reports zero skill.
    const labels = [...Array(19).fill(0), 1];
    const predictions = labels.map(() => 0.05);
    expect(brierScore(predictions, labels)).toBeLessThan(0.05);
    expect(brierSkillScore(predictions, labels)).toBeCloseTo(0, 10);
  });

  it("is 0, not 1, when every label is identical", () => {
    // The baseline is already perfect, so "skill over baseline" is undefined.
    expect(brierSkillScore([0.3, 0.7], [1, 1])).toBe(0);
  });
});

describe("reliabilityBins", () => {
  it("reports confidence and accuracy per bin", () => {
    const predictions = [0.05, 0.15, 0.85, 0.95];
    const labels = [0, 0, 1, 1];
    const bins = reliabilityBins(predictions, labels, 2, "uniform");

    expect(bins).toHaveLength(2);
    expect(bins[0]?.meanConfidence).toBeCloseTo(0.1, 10);
    expect(bins[0]?.meanAccuracy).toBe(0);
    expect(bins[1]?.meanConfidence).toBeCloseTo(0.9, 10);
    expect(bins[1]?.meanAccuracy).toBe(1);
  });

  it("drops empty bins instead of reporting NaN", () => {
    const bins = reliabilityBins([0.9, 0.95], [1, 1], 10, "uniform");
    expect(bins).toHaveLength(1);
    expect(bins.every((bin) => bin.count > 0)).toBe(true);
  });

  it("includes the upper edge in the last bin so 1.0 is never dropped", () => {
    const bins = reliabilityBins([1], [1], 10, "uniform");
    expect(bins).toHaveLength(1);
    expect(bins[0]?.count).toBe(1);
  });

  it("keeps quantile bins non-empty when many predictions tie", () => {
    // Degenerate quantile edges collapse to zero-width bins; de-duplicating the
    // edges is what stops that from producing empty or NaN bins.
    const predictions = Array(20).fill(0.7);
    const labels = Array(20).fill(1);
    const bins = reliabilityBins(predictions, labels, 10, "quantile");
    expect(bins.length).toBeGreaterThan(0);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(20);
  });

  it("assigns every observation to exactly one bin", () => {
    const predictions = [0, 0.1, 0.25, 0.5, 0.75, 0.99, 1];
    const labels = [0, 0, 1, 0, 1, 1, 1];
    for (const strategy of ["uniform", "quantile"] as const) {
      const bins = reliabilityBins(predictions, labels, 4, strategy);
      expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(
        predictions.length,
      );
    }
  });

  it("returns nothing for empty input", () => {
    expect(reliabilityBins([], [], 10)).toEqual([]);
  });
});

describe("expectedCalibrationError", () => {
  it("is 0 for a perfectly calibrated forecaster", () => {
    // Ten observations predicted 0.5, exactly five of which are positive.
    const predictions = Array(10).fill(0.5);
    const labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    expect(expectedCalibrationError(predictions, labels, 5)).toBeCloseTo(0, 10);
  });

  it("equals the gap for a single-bin over-confident model", () => {
    // Predicts 0.9 for everything; only half are positive → gap = 0.4.
    const predictions = Array(10).fill(0.9);
    const labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    expect(expectedCalibrationError(predictions, labels, 5)).toBeCloseTo(0.4, 10);
  });

  it("weights bins by their count, not equally", () => {
    // Bin A: 9 obs, predicted 0.1, 0 positive → gap 0.1, weight 0.9
    // Bin B: 1 obs, predicted 0.9, 0 positive → gap 0.9, weight 0.1
    // ECE = 0.9*0.1 + 0.1*0.9 = 0.18  (an unweighted mean would give 0.5)
    const predictions = [...Array(9).fill(0.1), 0.9];
    const labels = Array(10).fill(0);
    expect(expectedCalibrationError(predictions, labels, 2, "uniform")).toBeCloseTo(
      0.18,
      10,
    );
  });

  it("is 0 for empty input", () => {
    expect(expectedCalibrationError([], [], 10)).toBe(0);
  });
});

describe("maximumCalibrationError", () => {
  it("reports the worst bin, which ECE averages away", () => {
    const predictions = [...Array(9).fill(0.1), 0.9];
    const labels = Array(10).fill(0);
    expect(maximumCalibrationError(predictions, labels, 2, "uniform")).toBeCloseTo(
      0.9,
      10,
    );
  });

  it("is at least as large as ECE", () => {
    const predictions = [0.1, 0.4, 0.6, 0.9, 0.95, 0.2];
    const labels = [0, 1, 0, 1, 1, 0];
    expect(
      maximumCalibrationError(predictions, labels, 3),
    ).toBeGreaterThanOrEqual(expectedCalibrationError(predictions, labels, 3));
  });
});
