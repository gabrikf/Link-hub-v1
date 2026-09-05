import { describe, expect, it } from "vitest";
import {
  MAX_IMPORTANCE_COPIES,
  MIN_PROPENSITY,
  POSITION_BIAS_ETA,
  deriveSkipAboveNegatives,
  expandByImportanceWeight,
  inversePropensityWeight,
  rankPropensity,
} from "./exposure.js";
import { expectDefined } from "./expect-defined.js";
import { resolveLabel } from "./labels.js";
import type { ResumeTrainingRow } from "./training-types.js";

function row(overrides: Partial<ResumeTrainingRow>): ResumeTrainingRow {
  return {
    resumeId: "resume-1",
    queryText: "React engineer",
    headlineTitle: null,
    summary: null,
    totalYearsExperience: null,
    seniorityLevel: null,
    workModel: null,
    contractType: null,
    location: null,
    spokenLanguages: [],
    noticePeriod: null,
    openToRelocation: false,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: [],
    titles: [],
    workExperiences: [],
    posts: [],
    interactionScore: 0,
    ...overrides,
  };
}

describe("rankPropensity", () => {
  it("is 1 at rank 1 and decreases monotonically", () => {
    expect(rankPropensity(1)).toBe(1);

    let previous = Infinity;
    for (let rank = 1; rank <= 50; rank += 1) {
      const propensity = rankPropensity(rank);
      expect(propensity).toBeLessThanOrEqual(previous);
      previous = propensity;
    }
    expect(rankPropensity(50)).toBeLessThan(0.1);
  });

  it("uses the documented power law", () => {
    expect(rankPropensity(4)).toBeCloseTo(
      Math.pow(0.25, POSITION_BIAS_ETA),
      10,
    );
  });
});

describe("inversePropensityWeight", () => {
  it("up-weights candidates the recruiter had to scroll to find", () => {
    // Without this the model learns to reproduce the ranking that produced the
    // clicks — the feedback loop where the reranker slowly agrees with itself.
    expect(inversePropensityWeight({ displayedRank: 1 })).toBe(1);
    expect(inversePropensityWeight({ displayedRank: 20 })).toBeGreaterThan(1);
    expect(inversePropensityWeight({ displayedRank: 20 })).toBeLessThanOrEqual(
      1 / MIN_PROPENSITY,
    );
  });

  it("falls back to 1 when nothing about exposure was logged", () => {
    expect(inversePropensityWeight({})).toBe(1);
    expect(
      inversePropensityWeight({ displayedRank: null, propensity: null }),
    ).toBe(1);
  });

  it("prefers a logged propensity over the rank approximation", () => {
    expect(
      inversePropensityWeight({ displayedRank: 40, propensity: 0.5 }),
    ).toBe(2);
  });

  it("clamps the weight so one deep click cannot outvote the whole page", () => {
    expect(
      inversePropensityWeight({ displayedRank: 500, propensity: 0.000001 }),
    ).toBe(1 / MIN_PROPENSITY);
  });
});

describe("expandByImportanceWeight", () => {
  it("leaves an unweighted dataset exactly as it was", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ index }));
    expect(expandByImportanceWeight(rows, () => 1)).toHaveLength(25);
  });

  it("replicates in proportion to the weight and carries the fraction forward", () => {
    // Systematic resampling: 4 rows at weight 2.5 must produce exactly 10
    // copies, not 8 (round-down) or 12 (round-up).
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(expandByImportanceWeight(rows, () => 2.5)).toHaveLength(10);
  });

  it("never exceeds the replication ceiling", () => {
    expect(expandByImportanceWeight([{ id: "a" }], () => 1000)).toHaveLength(
      MAX_IMPORTANCE_COPIES,
    );
  });

  it("gives a deep-ranked row more copies than a top-ranked one", () => {
    const top = row({ resumeId: "top", displayedRank: 1 });
    const deep = row({ resumeId: "deep", displayedRank: 30 });

    const expanded = expandByImportanceWeight([top, deep], (candidate) =>
      inversePropensityWeight(candidate),
    );

    const topCopies = expanded.filter((r) => r.resumeId === "top").length;
    const deepCopies = expanded.filter((r) => r.resumeId === "deep").length;

    expect(deepCopies).toBeGreaterThan(topCopies);
  });
});

describe("deriveSkipAboveNegatives", () => {
  it("turns candidates ranked above a click into explicit negatives", () => {
    // The recruiter's eyes reached rank 5, so they reached ranks 1-4. Anyone up
    // there they did not act on was examined and rejected — the cheapest
    // correct negative there is, and it needs no propensity model.
    const rows = [
      row({
        resumeId: "skipped",
        searchSessionId: "s1",
        displayedRank: 2,
        interactionScore: 0.35,
      }),
      row({
        resumeId: "clicked",
        searchSessionId: "s1",
        displayedRank: 5,
        interactionScore: 1,
      }),
    ];

    const negatives = deriveSkipAboveNegatives(rows);

    expect(negatives).toHaveLength(1);
    const negative = expectDefined(negatives[0], "the derived skip-above row");
    expect(negative.resumeId).toBe("skipped#skip-above");
    expect(resolveLabel(negative)).toBe(0);
  });

  it("overrules the skipped row's own weak positive", () => {
    const negatives = deriveSkipAboveNegatives([
      row({
        resumeId: "viewed",
        searchSessionId: "s1",
        displayedRank: 1,
        interactionScore: 0.35,
      }),
      row({
        resumeId: "emailed",
        searchSessionId: "s1",
        displayedRank: 9,
        interactionScore: 1,
      }),
    ]);

    // The row's raw score would give label 0.175; the recruiter looked and then
    // chose someone nine places lower, so the forced label wins.
    const negative = expectDefined(negatives[0], "the derived skip-above row");
    expect(negative.interactionScore).toBeCloseTo(0.35, 10);
    expect(negative.forcedLabel).toBe(0);
    expect(resolveLabel(negative)).toBe(0);
  });

  it("produces nothing below the deepest engagement", () => {
    const negatives = deriveSkipAboveNegatives([
      row({
        resumeId: "clicked",
        searchSessionId: "s1",
        displayedRank: 1,
        interactionScore: 1,
      }),
      row({
        resumeId: "below",
        searchSessionId: "s1",
        displayedRank: 7,
        interactionScore: 0.35,
      }),
    ]);

    expect(negatives).toHaveLength(0);
  });

  it("produces nothing for a session with no positive interaction at all", () => {
    const negatives = deriveSkipAboveNegatives([
      row({
        resumeId: "a",
        searchSessionId: "s1",
        displayedRank: 1,
        interactionScore: 0.35,
      }),
      row({
        resumeId: "b",
        searchSessionId: "s1",
        displayedRank: 2,
        interactionScore: 0.35,
      }),
    ]);

    expect(negatives).toHaveLength(0);
  });

  it("never crosses session boundaries", () => {
    const negatives = deriveSkipAboveNegatives([
      row({
        resumeId: "other-session",
        searchSessionId: "s2",
        displayedRank: 1,
        interactionScore: 0.35,
      }),
      row({
        resumeId: "clicked",
        searchSessionId: "s1",
        displayedRank: 9,
        interactionScore: 1,
      }),
    ]);

    expect(negatives).toHaveLength(0);
  });

  it("ignores rows with no exposure context", () => {
    expect(
      deriveSkipAboveNegatives([
        row({ resumeId: "a", interactionScore: 0.35 }),
        row({ resumeId: "b", interactionScore: 1 }),
      ]),
    ).toHaveLength(0);
  });
});
