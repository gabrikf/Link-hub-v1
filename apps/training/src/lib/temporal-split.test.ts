import { describe, expect, it } from "vitest";
import { DEFAULT_EMBARGO_MS, temporalSplit } from "./temporal-split.js";
import type { ResumeTrainingRow } from "./training-types.js";

function row(
  resumeId: string,
  observedAt: Date | null,
  isSynthetic = false,
): ResumeTrainingRow {
  return {
    resumeId,
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
    interactionScore: 1,
    observedAt,
    isSynthetic,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

describe("temporalSplit", () => {
  const rows = Array.from({ length: 100 }, (_, index) =>
    row(`r-${index}`, new Date(START + index * DAY)),
  );

  it("puts the latest rows in the holdout and nothing later in training", () => {
    // A random split trains on the future: the same recruiter's later behaviour
    // leaks in and the validation number comes out flatteringly high, right up
    // until the model meets tomorrow's traffic.
    const split = temporalSplit(rows);

    expect(split.holdout.length).toBeGreaterThan(0);
    expect(split.train.length).toBeGreaterThan(0);

    const latestTrain = Math.max(
      ...split.train.map((r) => r.observedAt!.getTime()),
    );
    const earliestHoldout = Math.min(
      ...split.holdout.map((r) => r.observedAt!.getTime()),
    );

    expect(latestTrain).toBeLessThan(earliestHoldout);
  });

  it("uses one wall-clock cutoff shared by every row", () => {
    const split = temporalSplit(rows);

    expect(split.cutoff).not.toBeNull();
    for (const holdoutRow of split.holdout) {
      expect(holdoutRow.observedAt!.getTime()).toBeGreaterThanOrEqual(
        split.cutoff!.getTime(),
      );
    }
  });

  it("discards rows inside the embargo gap rather than training on them", () => {
    // Interactions cluster: one recruiter working one search produces a burst
    // of rows minutes apart. A burst straddling the cutoff would put
    // near-identical rows on both sides.
    // 45 daily rows, then a 15-row burst two minutes apart. The 80th percentile
    // lands inside the burst, so without an embargo the rows on either side of
    // the cutoff would be minutes — and one recruiter session — apart.
    const burst = [
      ...Array.from({ length: 45 }, (_, index) =>
        row(`old-${index}`, new Date(START + index * DAY)),
      ),
      ...Array.from({ length: 15 }, (_, index) =>
        row(
          `burst-${index}`,
          new Date(START + 45 * DAY + index * 2 * 60 * 1000),
        ),
      ),
    ];

    const split = temporalSplit(burst, { embargoMs: DEFAULT_EMBARGO_MS });

    expect(split.embargoed).toBeGreaterThan(0);
    expect(split.train.length + split.holdout.length + split.embargoed).toBe(
      burst.length,
    );
    // Nothing from the burst may leak into training.
    expect(
      split.train.filter((r) => r.resumeId.startsWith("burst-")),
    ).toHaveLength(0);
  });

  it("keeps the embargoed rows when the gap is zero", () => {
    const noEmbargo = temporalSplit(rows, { embargoMs: 0 });
    expect(noEmbargo.embargoed).toBe(0);
    expect(noEmbargo.train.length + noEmbargo.holdout.length).toBe(rows.length);
  });

  it("always trains on synthetic rows and never measures on them", () => {
    const mixed = [
      ...rows,
      ...Array.from({ length: 20 }, (_, index) =>
        row(`synthetic-${index}`, null, true),
      ),
    ];

    const split = temporalSplit(mixed);

    expect(split.holdout.every((r) => !r.isSynthetic)).toBe(true);
    expect(split.train.filter((r) => r.isSynthetic)).toHaveLength(20);
  });

  it("degrades to an all-training split when nothing is timestamped", () => {
    const untimed = Array.from({ length: 10 }, (_, index) =>
      row(`u-${index}`, null),
    );
    const split = temporalSplit(untimed);

    expect(split.train).toHaveLength(10);
    expect(split.holdout).toHaveLength(0);
    expect(split.cutoff).toBeNull();
  });

  it("honours the requested holdout fraction", () => {
    const split = temporalSplit(rows, { holdoutFraction: 0.1, embargoMs: 0 });
    expect(split.holdout).toHaveLength(10);
  });
});
