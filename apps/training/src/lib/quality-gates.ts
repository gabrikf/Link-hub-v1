import {
  brierScore,
  brierSkillScore,
  expectedCalibrationError,
  maximumCalibrationError,
  reliabilityBins,
} from "@repo/schemas";

/**
 * Calibration reporting for the held-out split.
 *
 * Ranking metrics say whether the order is right; they say nothing about whether
 * the number printed on the card means anything. A model can rank perfectly and
 * still tell every recruiter "87% match" — which is exactly the failure mode
 * that matters here, because the product shows the score, not the rank.
 *
 * All the maths comes from `@repo/schemas/eval` so the API, the browser and this
 * pipeline report numbers that can be compared to each other.
 */
export interface CalibrationReport {
  count: number;
  brier: number;
  brierSkill: number;
  ece: number;
  mce: number;
  bins: ReturnType<typeof reliabilityBins>;
}

export const CALIBRATION_GATES = {
  /**
   * Below zero means the model is worse than always predicting the base rate.
   * Shipping that is strictly worse than shipping nothing.
   */
  minBrierSkillScore: 0,
  /** Average gap between the stated confidence and the observed frequency. */
  maxExpectedCalibrationError: 0.25,
  /** Below this the held-out set is too small for the numbers to mean anything. */
  minSamples: 30,
} as const;

export function buildCalibrationReport(
  predictions: readonly number[],
  labels: readonly number[],
  binCount = 10,
): CalibrationReport {
  return {
    count: predictions.length,
    brier: brierScore(predictions, labels),
    brierSkill: brierSkillScore(predictions, labels),
    ece: expectedCalibrationError(predictions, labels, binCount),
    mce: maximumCalibrationError(predictions, labels, binCount),
    bins: reliabilityBins(predictions, labels, binCount),
  };
}

export interface GateResult {
  passed: boolean;
  /** True when there was not enough held-out data to judge either way. */
  skipped: boolean;
  failures: string[];
}

export function evaluateCalibrationGates(
  report: CalibrationReport,
  gates: typeof CALIBRATION_GATES = CALIBRATION_GATES,
): GateResult {
  if (report.count < gates.minSamples) {
    return { passed: true, skipped: true, failures: [] };
  }

  const failures: string[] = [];

  if (report.brierSkill < gates.minBrierSkillScore) {
    failures.push(
      `Brier skill score ${report.brierSkill.toFixed(4)} is below ${gates.minBrierSkillScore} — the model is no better than predicting the base rate.`,
    );
  }

  if (report.ece > gates.maxExpectedCalibrationError) {
    failures.push(
      `Expected calibration error ${report.ece.toFixed(4)} exceeds ${gates.maxExpectedCalibrationError} — the displayed percentage does not match observed frequency.`,
    );
  }

  return { passed: failures.length === 0, skipped: false, failures };
}
