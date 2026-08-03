import { describe, expect, it } from "vitest";
import {
  matchCoverage,
  matchedTerms,
  normalizeMatchToken,
  termMatches,
} from "./term-matching.js";

describe("normalizeMatchToken", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeMatchToken("  Tailwind   CSS ")).toBe("tailwind css");
  });
});

describe("termMatches", () => {
  const cases: Array<[string, string, boolean, string]> = [
    ["react", "react", true, "exact"],
    ["React", "  react ", true, "case and whitespace"],
    ["react", "React Native", true, "candidate term contains the request"],
    ["react", "Preact", false, "no word boundary before"],
    ["go", "MongoDB", false, "substring without boundaries is not a match"],
    ["go", "Go", true, "short term, exact"],
    ["node.js", "nodejs", true, "punctuation-insensitive equality"],
    ["node", "Node.js", true, "boundary is punctuation"],
    ["react native", "react", false, "asymmetric: the request is more specific"],
    ["sql", "PostgreSQL", false, "suffix without a boundary"],
    ["c#", "C#", true, "special characters survive normalisation"],
    ["react", "", false, "empty candidate term"],
    ["", "react", false, "empty request term"],
  ];

  it.each(cases)(
    "termMatches(%o, %o) === %o (%s)",
    (expected, actual, result) => {
      expect(termMatches(expected, actual)).toBe(result);
    },
  );
});

describe("matchCoverage", () => {
  it("measures the share of the REQUEST that is covered, not the union", () => {
    // The whole point of dropping Jaccard: a broad candidate who has everything
    // asked for must not be punished for also knowing other things.
    const focused = matchCoverage(["react"], ["react"]);
    const broad = matchCoverage(
      ["react"],
      ["react", "vue", "svelte", "angular", "ember"],
    );

    expect(focused).toBe(1);
    expect(broad).toBe(1);
  });

  it("is 1 for a superset and partial for a partial cover", () => {
    expect(matchCoverage(["react", "node.js"], ["react"])).toBe(0.5);
    expect(matchCoverage(["react"], ["react", "node.js"])).toBe(1);
  });

  it("is 0 for disjoint sets", () => {
    expect(matchCoverage(["react", "node.js"], ["swift", "uikit"])).toBe(0);
  });

  it("returns 1 when nothing was requested", () => {
    expect(matchCoverage([], ["react"])).toBe(1);
    expect(matchCoverage([], [])).toBe(1);
    expect(matchCoverage(["  ", ""], ["react"])).toBe(1);
  });

  it("credits a mandatory skill matched by substring — the SQL filter's own semantics", () => {
    // `skills: ["react"]` passes this candidate through
    // `lower(name) LIKE '%react%'`, so the score must not call them a mismatch.
    expect(matchCoverage(["react"], ["React Native", "TypeScript"])).toBe(1);
  });

  it("de-duplicates the request before dividing", () => {
    expect(matchCoverage(["react", "React", " react "], ["react"])).toBe(1);
  });

  it("never exceeds 1 or drops below 0", () => {
    const value = matchCoverage(
      ["react", "node.js", "docker"],
      ["react native", "node.js", "kubernetes", "docker compose"],
    );
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});

describe("matchedTerms", () => {
  it("returns the normalised request terms that were satisfied", () => {
    expect(matchedTerms(["React", "Vue"], ["react native"])).toEqual(["react"]);
  });
});
