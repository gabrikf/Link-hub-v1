/**
 * Information-retrieval metrics for evaluating recruiter search and the AI
 * match rating.
 *
 * Lives in @repo/schemas (rather than in the API) because three workspaces need
 * the identical implementation: the API's search tests, the offline training
 * pipeline's quality gates, and any future eval script. A metric that is
 * computed two slightly different ways is a metric you cannot compare across
 * runs, which defeats the point of measuring at all.
 *
 * Conventions, fixed here once so historical numbers stay comparable:
 * - Ranks are 1-based; `ranked[0]` is rank 1.
 * - Relevance is GRADED on 0..3 (0 irrelevant, 1 marginal, 2 relevant,
 *   3 ideal-shortlist). Binary metrics binarise with `minGrade` (default 1).
 * - DCG uses the EXPONENTIAL gain `2^rel - 1` with a `log2(rank + 1)` discount.
 *   The alternative linear form (Järvelin-Kekäläinen) is equally defensible but
 *   yields different numbers; switching later would silently invalidate every
 *   stored baseline, so it is deliberately not configurable.
 */

/** Graded relevance judgements for one query: candidate id -> grade (0..3). */
export type Qrels = ReadonlyMap<string, number>;

/** Judgements keyed by query id — the "golden set". */
export type QrelsByQuery = ReadonlyMap<string, Qrels>;

const clampK = (k: number, length: number): number =>
  Math.max(0, Math.min(Math.trunc(k), length));

/**
 * Discounted cumulative gain over an already-ordered list of grades.
 *
 * `i + 2` because `gains` is 0-based while the discount is defined on 1-based
 * ranks: rank 1 must get `log2(2) = 1`, i.e. no discount at all.
 */
export function dcg(gains: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < gains.length; i += 1) {
    total += (2 ** (gains[i] ?? 0) - 1) / Math.log2(i + 2);
  }
  return total;
}

/**
 * Normalised DCG at k.
 *
 * The ideal ranking is derived from `qrels` — the judgements — NOT from the
 * returned list. Computing IDCG from what the system returned is the classic
 * nDCG bug: it scores a retriever that returns nothing but grade-1 documents as
 * a perfect 1.0, because its "ideal" is also all grade-1.
 *
 * Returns 0 when no relevant document exists, which keeps the metric defined
 * for zero-result-expected queries without special-casing at call sites.
 */
export function ndcgAtK(ranked: readonly string[], qrels: Qrels, k: number): number {
  const limit = clampK(k, ranked.length);
  const gains: number[] = [];
  for (let i = 0; i < limit; i += 1) {
    gains.push(qrels.get(ranked[i] as string) ?? 0);
  }

  const idealGrades = [...qrels.values()]
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, Math.trunc(k)));

  const idealDcg = dcg(idealGrades);
  return idealDcg > 0 ? dcg(gains) / idealDcg : 0;
}

/** Judged-relevant ids at or above `minGrade`. */
function relevantIds(qrels: Qrels, minGrade: number): Set<string> {
  const ids = new Set<string>();
  for (const [id, grade] of qrels) {
    if (grade >= minGrade) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Recall@k — fraction of all judged-relevant documents retrieved in the top k.
 *
 * Returns `null` (not 0) when the query has no relevant documents: such a query
 * carries no recall information and must be SKIPPED when averaging, otherwise
 * every zero-result-expected query drags the mean down for no reason.
 *
 * Counts distinct ids, so a ranking that accidentally repeats a hit cannot
 * inflate the score past 1.
 */
export function recallAtK(
  ranked: readonly string[],
  qrels: Qrels,
  k: number,
  minGrade = 1,
): number | null {
  const relevant = relevantIds(qrels, minGrade);
  if (relevant.size === 0) {
    return null;
  }

  const limit = clampK(k, ranked.length);
  const found = new Set<string>();
  for (let i = 0; i < limit; i += 1) {
    const id = ranked[i] as string;
    if (relevant.has(id)) {
      found.add(id);
    }
  }

  return found.size / relevant.size;
}

/**
 * Precision@k — fraction of the top k that is relevant.
 *
 * Positional by definition (the denominator is k, not the number of distinct
 * results), so unlike recall this does not de-duplicate: a list that shows the
 * same candidate twice really did spend two of its k slots on them.
 */
export function precisionAtK(
  ranked: readonly string[],
  qrels: Qrels,
  k: number,
  minGrade = 1,
): number {
  const denominator = Math.max(0, Math.trunc(k));
  if (denominator === 0) {
    return 0;
  }

  const limit = clampK(k, ranked.length);
  let hits = 0;
  for (let i = 0; i < limit; i += 1) {
    if ((qrels.get(ranked[i] as string) ?? 0) >= minGrade) {
      hits += 1;
    }
  }

  return hits / denominator;
}

/** Reciprocal rank of the first relevant hit; 0 when there is none. */
export function reciprocalRank(
  ranked: readonly string[],
  qrels: Qrels,
  minGrade = 1,
): number {
  for (let i = 0; i < ranked.length; i += 1) {
    if ((qrels.get(ranked[i] as string) ?? 0) >= minGrade) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Average precision at k.
 *
 * Denominator is `min(|relevant|, k)` — the AP@k convention — so a query with
 * 40 relevant candidates evaluated at k=10 can still reach 1.0. Using the
 * unbounded `|relevant|` would cap such a query at 0.25 and make the mean say
 * more about judgement depth than about ranking quality.
 */
export function averagePrecisionAtK(
  ranked: readonly string[],
  qrels: Qrels,
  k: number,
  minGrade = 1,
): number | null {
  const relevant = relevantIds(qrels, minGrade);
  if (relevant.size === 0) {
    return null;
  }

  const limit = clampK(k, ranked.length);
  let hits = 0;
  let sum = 0;
  for (let i = 0; i < limit; i += 1) {
    if (relevant.has(ranked[i] as string)) {
      hits += 1;
      sum += hits / (i + 1);
    }
  }

  const denominator = Math.min(relevant.size, Math.max(1, Math.trunc(k)));
  return sum / denominator;
}

/** Mean of the defined values, ignoring `null` (undefined-for-this-query). */
export function meanDefined(values: readonly (number | null)[]): number {
  const defined = values.filter((value): value is number => value !== null);
  if (defined.length === 0) {
    return 0;
  }
  return defined.reduce((sum, value) => sum + value, 0) / defined.length;
}

/** One system's ranking for one query, paired with that query's judgements. */
export type EvalRun = {
  queryId: string;
  ranked: readonly string[];
};

export type EvalReport = {
  queryCount: number;
  ndcgAtK: number;
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  mapAtK: number;
  /** Per-query nDCG, kept so callers can run a paired significance test. */
  perQueryNdcg: ReadonlyMap<string, number>;
  /** Queries whose ids had no judgements at all — a golden-set gap, not a score. */
  unjudgedQueryIds: readonly string[];
};

/**
 * Evaluates a whole run against a golden set.
 *
 * Queries with no judgements are reported separately rather than scored as 0:
 * an unjudged query means the golden set is incomplete, and silently averaging
 * it in as a zero makes a coverage problem look like a quality problem.
 */
export function evaluateRun(
  runs: readonly EvalRun[],
  qrelsByQuery: QrelsByQuery,
  k: number,
  minGrade = 1,
): EvalReport {
  const perQueryNdcg = new Map<string, number>();
  const unjudgedQueryIds: string[] = [];
  const ndcgs: number[] = [];
  const recalls: (number | null)[] = [];
  const precisions: number[] = [];
  const reciprocalRanks: number[] = [];
  const averagePrecisions: (number | null)[] = [];

  for (const run of runs) {
    const qrels = qrelsByQuery.get(run.queryId);
    if (!qrels || qrels.size === 0) {
      unjudgedQueryIds.push(run.queryId);
      continue;
    }

    const ndcg = ndcgAtK(run.ranked, qrels, k);
    perQueryNdcg.set(run.queryId, ndcg);
    ndcgs.push(ndcg);
    recalls.push(recallAtK(run.ranked, qrels, k, minGrade));
    precisions.push(precisionAtK(run.ranked, qrels, k, minGrade));
    reciprocalRanks.push(reciprocalRank(run.ranked, qrels, minGrade));
    averagePrecisions.push(averagePrecisionAtK(run.ranked, qrels, k, minGrade));
  }

  return {
    queryCount: ndcgs.length,
    ndcgAtK: meanDefined(ndcgs),
    recallAtK: meanDefined(recalls),
    precisionAtK: meanDefined(precisions),
    mrr: meanDefined(reciprocalRanks),
    mapAtK: meanDefined(averagePrecisions),
    perQueryNdcg,
    unjudgedQueryIds,
  };
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * The bootstrap below must be reproducible: a confidence interval that shifts
 * between CI runs turns a quality gate into a coin flip, and the first flake
 * teaches everyone to re-run the job until it passes.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BootstrapCi = {
  mean: number;
  lower: number;
  upper: number;
  /** True when the interval excludes 0, i.e. the difference is significant. */
  significant: boolean;
};

/**
 * Paired bootstrap confidence interval over per-query deltas.
 *
 * PAIRED because both systems are evaluated on the same queries: comparing two
 * independent means throws away the pairing and is far less sensitive, to the
 * point where a real +0.03 nDCG improvement reads as noise. Resampling queries
 * (not documents) is what makes the interval reflect "would this hold on a
 * different sample of recruiter queries?", which is the question being asked.
 */
export function pairedBootstrapCi(
  deltas: readonly number[],
  options: { iterations?: number; confidence?: number; seed?: number } = {},
): BootstrapCi {
  const { iterations = 1000, confidence = 0.95, seed = 42 } = options;

  if (deltas.length === 0) {
    return { mean: 0, lower: 0, upper: 0, significant: false };
  }

  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const random = mulberry32(seed);
  const means: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let i = 0; i < deltas.length; i += 1) {
      sum += deltas[Math.floor(random() * deltas.length)] as number;
    }
    means.push(sum / deltas.length);
  }

  means.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  const lower = means[Math.floor(alpha * (means.length - 1))] as number;
  const upper = means[Math.ceil((1 - alpha) * (means.length - 1))] as number;

  return { mean, lower, upper, significant: lower > 0 || upper < 0 };
}

/**
 * Reciprocal Rank Fusion — merges rankings from retrievers whose scores are not
 * comparable (cosine similarity vs. BM25 vs. a model score).
 *
 * Rank-only by construction, which is exactly why it sidesteps score
 * normalisation. `k = 60` is the value from Cormack et al. (2009) and the
 * default in every major search engine; the optimum is famously flat over
 * roughly [20, 100], so it is rarely worth tuning.
 */
export function reciprocalRankFusion(
  rankings: readonly { ids: readonly string[]; weight?: number }[],
  k = 60,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const { ids, weight = 1 } of rankings) {
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i] as string;
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + i + 1));
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    // Ties break on id so the fused order is byte-stable across runs — without
    // this, equal-score candidates permute freely and every ranking test flakes.
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
