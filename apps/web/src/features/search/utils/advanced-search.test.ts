import { describe, expect, it } from "vitest";
import {
  describeMatch,
  formatTenure,
  formatWorkPeriod,
} from "./advanced-search";

describe("describeMatch", () => {
  it("turns a 0–1 score into a percentage a recruiter can read", () => {
    expect(describeMatch(0.82).percent).toBe("82%");
  });

  it("accepts an already-scaled score without double-scaling it", () => {
    expect(describeMatch(82).percent).toBe("82%");
  });

  it("clamps out-of-range scores", () => {
    expect(describeMatch(-1).percent).toBe("0%");
    expect(describeMatch(140).percent).toBe("100%");
  });

  it("says so when there is no score, instead of showing a fake 0%", () => {
    // A failed rerank must not read as "this candidate is a 0% match". Rank 1
    // and rank 50 are equally unscored when the model never ran.
    const missing = describeMatch(null);

    expect(missing.percent).toBe("—");
    expect(missing.label).toBe("Match unavailable");
    expect(missing.percent).not.toBe("0%");
    expect(missing.label).not.toBe("Weak match");
  });

  it("labels each band so the number is interpretable", () => {
    expect(describeMatch(0.9).label).toBe("Strong match");
    expect(describeMatch(0.6).label).toBe("Good match");
    expect(describeMatch(0.3).label).toBe("Partial match");
    expect(describeMatch(0.1).label).toBe("Weak match");
  });

  it("explains what the score means rather than exposing a cosine", () => {
    const match = describeMatch(0.5);

    expect(match.description).toContain("50%");
    expect(match.description.toLowerCase()).not.toContain("similarity");
    expect(match.description.toLowerCase()).not.toContain("cosine");
  });
});

describe("formatWorkPeriod", () => {
  it("renders a closed period", () => {
    expect(formatWorkPeriod("2021-01-01", "2023-06-01", false)).toBe(
      "Jan 2021 — Jun 2023",
    );
  });

  it("renders an open-ended current role as Present", () => {
    expect(formatWorkPeriod("2021-01-01", null, true)).toBe(
      "Jan 2021 — Present",
    );
  });

  it("does not shift the month across timezones", () => {
    // A naive `new Date("2021-01-01")` renders as Dec 2020 west of UTC.
    expect(formatWorkPeriod("2021-01-01", "2021-01-01", false)).toContain(
      "Jan 2021",
    );
  });

  it("returns an empty string when there are no dates at all", () => {
    expect(formatWorkPeriod(null, null, false)).toBe("");
  });

  it("still says Present for a current role with no start date", () => {
    expect(formatWorkPeriod(null, null, true)).toBe("Present");
  });
});

describe("formatTenure", () => {
  it("reports years and months", () => {
    expect(formatTenure("2021-01-01", "2023-06-01", false)).toBe("2 yrs 5 mos");
  });

  it("drops the year part for sub-year stints", () => {
    expect(formatTenure("2023-01-01", "2023-09-01", false)).toBe("8 mos");
  });

  it("uses singular units where appropriate", () => {
    expect(formatTenure("2022-01-01", "2023-02-01", false)).toBe("1 yr 1 mo");
  });

  it("treats a same-month role as one month, not zero", () => {
    expect(formatTenure("2023-03-01", "2023-03-01", false)).toBe("1 mo");
  });

  it("returns an empty string when the span is unknowable", () => {
    expect(formatTenure(null, "2023-01-01", false)).toBe("");
    expect(formatTenure("2023-01-01", null, false)).toBe("");
  });

  it("measures a current role up to today", () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 2);
    const startDate = `${lastYear.getFullYear()}-${String(
      lastYear.getMonth() + 1,
    ).padStart(2, "0")}-01`;

    expect(formatTenure(startDate, null, true)).toContain("2 yrs");
  });
});
