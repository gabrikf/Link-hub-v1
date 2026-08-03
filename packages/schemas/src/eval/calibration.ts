/**
 * Calibration metrics for the AI match rating.
 *
 * The rating is shown to recruiters as a number, so it has to *mean* something:
 * candidates scored 0.8 should be contacted roughly 80% of the time. Ranking
 * metrics (nDCG, MRR) are invariant to any monotone rescaling of the score and
 * therefore cannot detect a model that ranks perfectly while claiming 0.95
 * confidence on everyone. These metrics can.
 */

/** One bin of a reliability diagram. */
export type ReliabilityBin = {
  /** Inclusive lower / exclusive upper bound of the predicted-probability bin. */
  lowerBound: number;
  upperBound: number;
  count: number;
  /** Mean predicted probability in the bin. */
  meanConfidence: number;
  /** Observed positive rate in the bin. */
  meanAccuracy: number;
};

function assertSameLength(predictions: readonly number[], labels: readonly number[]) {
  if (predictions.length !== labels.length) {
    throw new Error(
      `predictions and labels must be the same length (got ${predictions.length} and ${labels.length})`,
    );
  }
}

/**
 * Brier score — mean squared error of a probabilistic forecast. Lower is
 * better; range [0, 1].
 *
 * Preferred over ECE as the primary number because it is a STRICTLY PROPER
 * scoring rule (uniquely minimised by the true probabilities) and needs no
 * binning, so it has no free parameter to tune a result into existence.
 */
export function brierScore(
  predictions: readonly number[],
  labels: readonly number[],
): number {
  assertSameLength(predictions, labels);
  if (predictions.length === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    const error = (predictions[i] as number) - (labels[i] as number);
    total += error * error;
  }
  return total / predictions.length;
}

/**
 * Brier Skill Score against the base-rate forecaster (always predict the
 * observed positive rate). 0 = no better than guessing the base rate, 1 =
 * perfect, negative = worse than the trivial baseline.
 *
 * Raw Brier is uninterpretable on imbalanced data — with a 5% positive rate,
 * predicting 0.05 for everything already scores ~0.0475, which looks excellent
 * and is worthless. BSS removes that illusion.
 */
export function brierSkillScore(
  predictions: readonly number[],
  labels: readonly number[],
): number {
  assertSameLength(predictions, labels);
  if (predictions.length === 0) {
    return 0;
  }

  const baseRate =
    labels.reduce((sum, label) => sum + label, 0) / labels.length;
  const baseline = baseRate * (1 - baseRate);
  if (baseline === 0) {
    // Every label identical: the baseline is already perfect, so "skill over
    // baseline" is undefined. 0 is the honest answer, not 1.
    return 0;
  }

  return 1 - brierScore(predictions, labels) / baseline;
}

/**
 * Partitions predictions into reliability bins.
 *
 * `quantile` (equal-mass) bins are the default because model scores cluster:
 * with uniform bins an MLP that outputs 0.7-0.9 for almost everything leaves
 * eight bins empty and computes ECE from two, which is both unstable and
 * flattering. Empty bins are dropped from the result.
 */
export function reliabilityBins(
  predictions: readonly number[],
  labels: readonly number[],
  binCount = 10,
  strategy: "uniform" | "quantile" = "quantile",
): ReliabilityBin[] {
  assertSameLength(predictions, labels);
  if (predictions.length === 0 || binCount <= 0) {
    return [];
  }

  const indices = predictions.map((_, index) => index);
  let edges: number[];

  if (strategy === "uniform") {
    edges = Array.from({ length: binCount + 1 }, (_, i) => i / binCount);
  } else {
    const sorted = [...predictions].sort((a, b) => a - b);
    edges = [0];
    for (let i = 1; i < binCount; i += 1) {
      const position = Math.floor((i / binCount) * sorted.length);
      edges.push(sorted[Math.min(position, sorted.length - 1)] as number);
    }
    edges.push(1);
    // Quantile edges collapse when many predictions tie; de-duplicating keeps
    // the bins non-empty and monotone instead of producing zero-width bins.
    edges = [...new Set(edges)].sort((a, b) => a - b);
  }

  const bins: ReliabilityBin[] = [];

  for (let b = 0; b < edges.length - 1; b += 1) {
    const lowerBound = edges[b] as number;
    const upperBound = edges[b + 1] as number;
    const isLast = b === edges.length - 2;

    const members = indices.filter((index) => {
      const value = predictions[index] as number;
      return value >= lowerBound && (isLast ? value <= upperBound : value < upperBound);
    });

    if (members.length === 0) {
      continue;
    }

    let confidenceSum = 0;
    let accuracySum = 0;
    for (const index of members) {
      confidenceSum += predictions[index] as number;
      accuracySum += labels[index] as number;
    }

    bins.push({
      lowerBound,
      upperBound,
      count: members.length,
      meanConfidence: confidenceSum / members.length,
      meanAccuracy: accuracySum / members.length,
    });
  }

  return bins;
}

/**
 * Expected Calibration Error — count-weighted mean gap between confidence and
 * observed accuracy.
 *
 * ECE is biased by bin count, so ALWAYS report `binCount` next to the value and
 * never compare two ECEs computed with different bin counts. That is precisely
 * why this takes the parameter explicitly rather than hiding a default deep in
 * a config.
 */
export function expectedCalibrationError(
  predictions: readonly number[],
  labels: readonly number[],
  binCount = 10,
  strategy: "uniform" | "quantile" = "quantile",
): number {
  const bins = reliabilityBins(predictions, labels, binCount, strategy);
  const total = predictions.length;
  if (total === 0) {
    return 0;
  }

  return bins.reduce(
    (sum, bin) =>
      sum + (bin.count / total) * Math.abs(bin.meanAccuracy - bin.meanConfidence),
    0,
  );
}

/** Worst-case calibration gap across bins — the tail ECE averages away. */
export function maximumCalibrationError(
  predictions: readonly number[],
  labels: readonly number[],
  binCount = 10,
  strategy: "uniform" | "quantile" = "quantile",
): number {
  const bins = reliabilityBins(predictions, labels, binCount, strategy);
  return bins.reduce(
    (worst, bin) => Math.max(worst, Math.abs(bin.meanAccuracy - bin.meanConfidence)),
    0,
  );
}
