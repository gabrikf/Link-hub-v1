import { describe, expect, it } from "vitest";
import {
  averagePrecisionAtK,
  dcg,
  evaluateRun,
  meanDefined,
  mulberry32,
  ndcgAtK,
  pairedBootstrapCi,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  reciprocalRankFusion,
  type Qrels,
} from "./ir-metrics.js";

/**
 * Every expected value here is computed BY HAND in the comment above it. A
 * metric test that asserts against the implementation's own output is worthless
 * — it locks in whatever bug shipped first, and these are exactly the formulas
 * where a plausible-looking mistake (wrong log base, IDCG from the wrong list)
 * silently invalidates every experiment that follows.
 */

const qrels = (entries: Record<string, number>): Qrels =>
  new Map(Object.entries(entries));

describe("dcg", () => {
  it("applies no discount at rank 1 and log2(rank+1) after", () => {
    // gains [3, 2]:
    //   (2^3 - 1)/log2(2) = 7/1     = 7
    //   (2^2 - 1)/log2(3) = 3/1.585 = 1.8927892…
    //   total ≈ 8.8927892
    expect(dcg([3, 2])).toBeCloseTo(7 + 3 / Math.log2(3), 10);
  });

  it("is 0 for all-zero gains and for an empty list", () => {
    expect(dcg([0, 0, 0])).toBe(0);
    expect(dcg([])).toBe(0);
  });
});

describe("ndcgAtK", () => {
  it("returns 1 for the ideal ordering", () => {
    const judgements = qrels({ a: 3, b: 2, c: 1 });
    expect(ndcgAtK(["a", "b", "c"], judgements, 3)).toBeCloseTo(1, 10);
  });

  it("penalises a reversed ordering", () => {
    const judgements = qrels({ a: 3, b: 2, c: 1 });
    // DCG  = 1/1 + 3/log2(3) + 7/log2(4) = 1 + 1.892789 + 3.5 = 6.392789
    // IDCG = 7/1 + 3/log2(3) + 1/log2(4) = 7 + 1.892789 + 0.5 = 9.392789
    const expected =
      (1 + 3 / Math.log2(3) + 7 / 2) / (7 + 3 / Math.log2(3) + 1 / 2);
    expect(ndcgAtK(["c", "b", "a"], judgements, 3)).toBeCloseTo(expected, 10);
  });

  it("derives IDCG from the judgements, not from the returned list", () => {
    // THE classic nDCG bug. A run that returns only the grade-1 document must
    // NOT score 1.0 just because that is the best thing it happened to return —
    // the ideal ranking includes the grade-3 document it missed.
    const judgements = qrels({ great: 3, ok: 1 });
    const score = ndcgAtK(["ok"], judgements, 1);
    // DCG = 1/1 = 1 ; IDCG@1 = 7/1 = 7 → 1/7
    expect(score).toBeCloseTo(1 / 7, 10);
    expect(score).toBeLessThan(1);
  });

  it("truncates at k and ignores anything beyond it", () => {
    const judgements = qrels({ a: 3, b: 3 });
    // Only rank 1 counts: DCG@1 = 0 (miss), IDCG@1 = 7 → 0
    expect(ndcgAtK(["miss", "a", "b"], judgements, 1)).toBe(0);
  });

  it("returns 0 when nothing is relevant rather than dividing by zero", () => {
    expect(ndcgAtK(["a"], qrels({ a: 0 }), 5)).toBe(0);
    expect(ndcgAtK(["a"], qrels({}), 5)).toBe(0);
  });

  it("treats unjudged documents as grade 0", () => {
    const judgements = qrels({ a: 3 });
    // ["x", "a"] → DCG = 0 + 7/log2(3) ; IDCG@2 = 7
    expect(ndcgAtK(["x", "a"], judgements, 2)).toBeCloseTo(
      7 / Math.log2(3) / 7,
      10,
    );
  });
});

describe("recallAtK", () => {
  const judgements = qrels({ a: 2, b: 1, c: 3, d: 0 });

  it("counts distinct relevant hits over all relevant documents", () => {
    // relevant (grade ≥ 1) = {a, b, c} → 2 of 3 found
    expect(recallAtK(["a", "d", "c"], judgements, 3)).toBeCloseTo(2 / 3, 10);
  });

  it("cannot exceed 1 when a ranking repeats a hit", () => {
    expect(recallAtK(["a", "a", "a"], judgements, 3)).toBeCloseTo(1 / 3, 10);
  });

  it("honours a stricter minGrade", () => {
    // grade ≥ 2 → relevant = {a, c}; only `a` is in the top 2
    expect(recallAtK(["a", "b"], judgements, 2, 2)).toBeCloseTo(1 / 2, 10);
  });

  it("returns null (skip, not zero) when the query has no relevant documents", () => {
    // Averaging an undefined recall in as 0 would make every
    // zero-result-expected golden query look like a failure.
    expect(recallAtK(["a"], qrels({ a: 0 }), 5)).toBeNull();
  });
});

describe("precisionAtK", () => {
  it("divides by k, not by the number of results returned", () => {
    // 1 hit in a top-5 request that only returned 2 items → 1/5, not 1/2
    expect(precisionAtK(["a", "x"], qrels({ a: 2 }), 5)).toBeCloseTo(1 / 5, 10);
  });

  it("is positional, so a repeated hit really does occupy two slots", () => {
    expect(precisionAtK(["a", "a"], qrels({ a: 2 }), 2)).toBe(1);
  });

  it("is 0 for k = 0", () => {
    expect(precisionAtK(["a"], qrels({ a: 3 }), 0)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("uses the first relevant hit, 1-based", () => {
    expect(reciprocalRank(["x", "y", "a"], qrels({ a: 1 }))).toBeCloseTo(1 / 3, 10);
    expect(reciprocalRank(["a"], qrels({ a: 1 }))).toBe(1);
  });

  it("is 0 when nothing relevant is retrieved", () => {
    expect(reciprocalRank(["x"], qrels({ a: 3 }))).toBe(0);
  });

  it("skips hits below minGrade", () => {
    // `b` is grade 1, `a` is grade 3; with minGrade 2 the first hit is rank 2
    expect(reciprocalRank(["b", "a"], qrels({ a: 3, b: 1 }), 2)).toBe(1 / 2);
  });
});

describe("averagePrecisionAtK", () => {
  it("averages precision at each relevant hit", () => {
    const judgements = qrels({ a: 1, b: 1 });
    // hits at ranks 1 and 3 → (1/1 + 2/3) / min(2, 3) = 1.6667/2 = 0.8333
    expect(averagePrecisionAtK(["a", "x", "b"], judgements, 3)).toBeCloseTo(
      (1 + 2 / 3) / 2,
      10,
    );
  });

  it("can reach 1 at small k even when many documents are relevant", () => {
    // The min(|R|, k) denominator is what makes this possible: with |R| = 40
    // judged relevant and k = 2, a perfect top-2 should score 1.0, not 0.05.
    const many: Record<string, number> = {};
    for (let i = 0; i < 40; i += 1) many[`d${i}`] = 1;
    expect(averagePrecisionAtK(["d0", "d1"], qrels(many), 2)).toBeCloseTo(1, 10);
  });

  it("returns null when there is nothing relevant to average over", () => {
    expect(averagePrecisionAtK(["a"], qrels({ a: 0 }), 5)).toBeNull();
  });
});

describe("meanDefined", () => {
  it("ignores nulls instead of counting them as zero", () => {
    expect(meanDefined([1, null, 0])).toBe(0.5);
  });

  it("is 0 when everything is undefined", () => {
    expect(meanDefined([null, null])).toBe(0);
  });
});

describe("evaluateRun", () => {
  const golden = new Map([
    ["q1", qrels({ a: 3, b: 1 })],
    ["q2", qrels({ c: 2 })],
  ]);

  it("aggregates per-query metrics across the golden set", () => {
    const report = evaluateRun(
      [
        { queryId: "q1", ranked: ["a", "b"] },
        { queryId: "q2", ranked: ["x", "c"] },
      ],
      golden,
      2,
    );

    expect(report.queryCount).toBe(2);
    expect(report.perQueryNdcg.get("q1")).toBeCloseTo(1, 10);
    // q1 MRR = 1, q2 MRR = 1/2 → 0.75
    expect(report.mrr).toBeCloseTo(0.75, 10);
    expect(report.recallAtK).toBeCloseTo(1, 10);
  });

  it("reports unjudged queries separately instead of scoring them 0", () => {
    // An unjudged query means the golden set is incomplete. Averaging it in as
    // a zero disguises a coverage gap as a quality regression.
    const report = evaluateRun(
      [
        { queryId: "q1", ranked: ["a"] },
        { queryId: "unknown", ranked: ["z"] },
      ],
      golden,
      2,
    );

    expect(report.unjudgedQueryIds).toEqual(["unknown"]);
    expect(report.queryCount).toBe(1);
    expect(report.ndcgAtK).toBeGreaterThan(0);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays inside [0, 1)", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pairedBootstrapCi", () => {
  it("is reproducible across calls with the same seed", () => {
    const deltas = [0.05, 0.02, -0.01, 0.04, 0.03];
    // A CI that moves between runs turns a quality gate into a coin flip.
    expect(pairedBootstrapCi(deltas)).toEqual(pairedBootstrapCi(deltas));
  });

  it("flags a consistent improvement as significant", () => {
    const deltas = Array.from({ length: 40 }, () => 0.05);
    const ci = pairedBootstrapCi(deltas);
    expect(ci.mean).toBeCloseTo(0.05, 10);
    expect(ci.significant).toBe(true);
    expect(ci.lower).toBeGreaterThan(0);
  });

  it("does not flag noise around zero as significant", () => {
    const deltas = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.05 : -0.05));
    const ci = pairedBootstrapCi(deltas);
    expect(ci.mean).toBeCloseTo(0, 10);
    expect(ci.significant).toBe(false);
  });

  it("brackets the observed mean", () => {
    const deltas = [0.1, 0.2, 0.05, 0.15, 0.12, 0.08];
    const ci = pairedBootstrapCi(deltas);
    expect(ci.lower).toBeLessThanOrEqual(ci.mean);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.mean);
  });

  it("handles an empty input without throwing", () => {
    expect(pairedBootstrapCi([])).toEqual({
      mean: 0,
      lower: 0,
      upper: 0,
      significant: false,
    });
  });
});

describe("reciprocalRankFusion", () => {
  it("uses 1/(k + rank) with 1-based ranks", () => {
    const [top] = reciprocalRankFusion([{ ids: ["a", "b"] }], 60);
    expect(top?.id).toBe("a");
    expect(top?.score).toBeCloseTo(1 / 61, 10);
  });

  it("rewards a document that both retrievers rank highly", () => {
    // `both` is rank 2 in each list; `solo` is rank 1 in one and absent in the
    // other. 2/62 = 0.03226 > 1/61 = 0.01639 — agreement beats a single strong
    // opinion, which is the whole point of RRF.
    const fused = reciprocalRankFusion(
      [
        { ids: ["solo", "both"] },
        { ids: ["other", "both"] },
      ],
      60,
    );
    expect(fused[0]?.id).toBe("both");
    expect(fused[0]?.score).toBeCloseTo(2 / 62, 10);
  });

  it("honours per-retriever weights", () => {
    const fused = reciprocalRankFusion(
      [
        { ids: ["vector"], weight: 1 },
        { ids: ["keyword"], weight: 0.5 },
      ],
      60,
    );
    expect(fused[0]?.id).toBe("vector");
    expect(fused[1]?.score).toBeCloseTo(0.5 / 61, 10);
  });

  it("breaks ties on id so the fused order is byte-stable", () => {
    // Without a deterministic tie-break, equal-score candidates permute freely
    // and every downstream ranking assertion becomes flaky.
    const first = reciprocalRankFusion([{ ids: ["b"] }, { ids: ["a"] }]);
    const second = reciprocalRankFusion([{ ids: ["a"] }, { ids: ["b"] }]);
    expect(first.map((r) => r.id)).toEqual(["a", "b"]);
    expect(second.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list for no rankings", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
