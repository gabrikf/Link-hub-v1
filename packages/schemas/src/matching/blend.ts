/**
 * How the learned score and the transparent coverage score are combined into
 * the single percentage the recruiter sees.
 *
 * Kept here (rather than inline in the worker) so the property that makes the
 * number defensible is testable: the blend is a convex combination, therefore
 * it is monotone in each input and always lands between them. A recruiter can
 * never see a match that is higher than both signals or lower than both.
 */

export const DEFAULT_MODEL_WEIGHT = 0.5;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(value, 1));
}

export interface BlendMatchScoreInput {
  /** Raw sigmoid output of the trained reranker. */
  modelScore: number;
  /** Transparent `matchCoverage`-derived alignment in [0, 1]. */
  coverageScore: number;
  /** Share given to the model, in [0, 1]. Defaults to an even split. */
  modelWeight?: number;
}

export function blendMatchScore({
  modelScore,
  coverageScore,
  modelWeight = DEFAULT_MODEL_WEIGHT,
}: BlendMatchScoreInput): number {
  const safeModel = clampUnit(modelScore);
  const safeCoverage = clampUnit(coverageScore);
  const weight = clampUnit(modelWeight);

  return safeModel * weight + safeCoverage * (1 - weight);
}
