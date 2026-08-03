import { PREPROCESSING_VERSION, type PreprocessingConfig } from "@repo/schemas";

/**
 * Whether an incremental run may resume from the previous weights.
 *
 * Two independent things used to go wrong here, and both were silent:
 *
 * 1. The `try/catch` wrapped only `loadLayersModel` + `compile`. `model.fit`
 *    sat outside it, so a changed input width did not fall back to a
 *    cold start — it killed the whole run. The live artifacts made that
 *    reachable: v1 declares `inputDimension: 125`, v2 declares 130.
 *
 * 2. Worse when it *didn't* crash: the preprocessing config was rebuilt from
 *    the current dataset on every run, so the vocabulary order changed and the
 *    warm-started weights — which are bound to feature *positions* — landed on
 *    a permuted feature space. Loss still went down. Every learned association
 *    was scrambled.
 *
 * So warm-starting requires the exact persisted vocabulary AND a matching width.
 * Anything else cold-starts, loudly.
 */
export type WarmStartDecision =
  | { warmStart: true; reason: "compatible" }
  | {
      warmStart: false;
      reason:
        | "cold-start-requested"
        | "missing-config"
        | "incompatible-preprocessing-version"
        | "missing-model"
        | "input-dimension-changed";
      detail?: string;
    };

export function decideWarmStart(input: {
  mode: "initial" | "incremental";
  persistedConfig: PreprocessingConfig | null;
  /** Input width of the model found on disk, or null when it failed to load. */
  loadedInputDim: number | null;
  /** Input width the current dataset encodes to. */
  dataInputDim: number;
}): WarmStartDecision {
  if (input.mode !== "incremental") {
    return { warmStart: false, reason: "cold-start-requested" };
  }

  if (!input.persistedConfig) {
    return { warmStart: false, reason: "missing-config" };
  }

  if (input.persistedConfig.version !== PREPROCESSING_VERSION) {
    return {
      warmStart: false,
      reason: "incompatible-preprocessing-version",
      detail: `persisted ${input.persistedConfig.version}, runtime ${PREPROCESSING_VERSION}`,
    };
  }

  if (input.loadedInputDim === null) {
    return { warmStart: false, reason: "missing-model" };
  }

  if (input.loadedInputDim !== input.dataInputDim) {
    return {
      warmStart: false,
      reason: "input-dimension-changed",
      detail: `model expects ${input.loadedInputDim}, data has ${input.dataInputDim}`,
    };
  }

  return { warmStart: true, reason: "compatible" };
}
