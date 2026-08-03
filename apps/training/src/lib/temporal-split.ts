import type { ResumeTrainingRow } from "./training-types.js";

/**
 * Gap between the end of the training window and the start of the held-out
 * window. Interactions cluster: one recruiter working one search produces a
 * burst of rows minutes apart. Without an embargo, a burst straddling the cutoff
 * puts near-identical rows on both sides and the held-out score measures
 * memorisation.
 */
export const DEFAULT_EMBARGO_MS = 60 * 60 * 1000;

export interface TemporalSplitResult {
  train: ResumeTrainingRow[];
  holdout: ResumeTrainingRow[];
  /** Rows discarded because they fall inside the embargo gap. */
  embargoed: number;
  cutoff: Date | null;
}

/**
 * Splits by wall clock, not at random.
 *
 * A random split trains on the future: the same recruiter's later behaviour
 * leaks into the training set and the validation number comes out flatteringly
 * high, right up until the model meets tomorrow's traffic. The cutoff is a
 * single instant shared by every user — not a per-user cutoff, which would leak
 * across users just as badly.
 *
 * Synthetic rows carry no time and always go to training: they are supervision,
 * not evidence, and measuring on them measures nothing.
 */
export function temporalSplit(
  rows: readonly ResumeTrainingRow[],
  options: { holdoutFraction?: number; embargoMs?: number } = {},
): TemporalSplitResult {
  const holdoutFraction = options.holdoutFraction ?? 0.2;
  const embargoMs = options.embargoMs ?? DEFAULT_EMBARGO_MS;

  const timed: ResumeTrainingRow[] = [];
  const untimed: ResumeTrainingRow[] = [];

  for (const row of rows) {
    if (row.observedAt instanceof Date && !Number.isNaN(row.observedAt.getTime())) {
      timed.push(row);
    } else {
      untimed.push(row);
    }
  }

  if (timed.length === 0) {
    return { train: [...rows], holdout: [], embargoed: 0, cutoff: null };
  }

  const sorted = [...timed].sort(
    (a, b) => a.observedAt!.getTime() - b.observedAt!.getTime(),
  );

  const cutoffIndex = Math.max(
    0,
    Math.floor(sorted.length * (1 - holdoutFraction)),
  );
  const cutoff = sorted[cutoffIndex]?.observedAt ?? null;

  if (!cutoff) {
    return { train: [...rows], holdout: [], embargoed: 0, cutoff: null };
  }

  const embargoStart = cutoff.getTime() - embargoMs;

  const train: ResumeTrainingRow[] = [...untimed];
  const holdout: ResumeTrainingRow[] = [];
  let embargoed = 0;

  for (const row of sorted) {
    const time = row.observedAt!.getTime();
    if (time >= cutoff.getTime()) {
      holdout.push(row);
    } else if (time >= embargoStart) {
      embargoed += 1;
    } else {
      train.push(row);
    }
  }

  return { train, holdout, embargoed, cutoff };
}
