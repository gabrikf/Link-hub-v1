import { describe, expect, it } from "vitest";
import { blendMatchScore } from "./blend.js";

describe("blendMatchScore", () => {
  it("is monotone in the model score at constant coverage", () => {
    // The property that makes the displayed percentage defensible: a candidate
    // the model likes more can never end up with a lower match.
    const coverageScore = 0.4;
    let previous = -Infinity;

    for (let modelScore = 0; modelScore <= 1.0001; modelScore += 0.05) {
      const blended = blendMatchScore({ modelScore, coverageScore });
      expect(blended).toBeGreaterThanOrEqual(previous);
      previous = blended;
    }
  });

  it("is monotone in the coverage score at constant model score", () => {
    const modelScore = 0.6;
    let previous = -Infinity;

    for (let coverageScore = 0; coverageScore <= 1.0001; coverageScore += 0.05) {
      const blended = blendMatchScore({ modelScore, coverageScore });
      expect(blended).toBeGreaterThanOrEqual(previous);
      previous = blended;
    }
  });

  it("always lands between the two inputs", () => {
    const samples = [0, 0.13, 0.37, 0.5, 0.72, 0.99, 1];

    for (const modelScore of samples) {
      for (const coverageScore of samples) {
        const blended = blendMatchScore({ modelScore, coverageScore });
        expect(blended).toBeGreaterThanOrEqual(
          Math.min(modelScore, coverageScore) - 1e-12,
        );
        expect(blended).toBeLessThanOrEqual(
          Math.max(modelScore, coverageScore) + 1e-12,
        );
      }
    }
  });

  it("clamps out-of-range and non-finite inputs instead of propagating them", () => {
    expect(blendMatchScore({ modelScore: NaN, coverageScore: 1 })).toBe(0.5);
    expect(blendMatchScore({ modelScore: 5, coverageScore: 1 })).toBe(1);
    expect(blendMatchScore({ modelScore: -3, coverageScore: 0 })).toBe(0);
  });

  it("honours an explicit model weight", () => {
    expect(
      blendMatchScore({ modelScore: 1, coverageScore: 0, modelWeight: 1 }),
    ).toBe(1);
    expect(
      blendMatchScore({ modelScore: 1, coverageScore: 0, modelWeight: 0 }),
    ).toBe(0);
  });
});
