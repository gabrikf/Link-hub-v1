import { matchCoverage } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { blueprintVocabulary } from "./blueprints.js";
import {
  SYNTHETIC_POSITIVE_RATIO,
  createCrossBlueprintNegatives,
  createSyntheticDataset,
  enrichDatasetWithSyntheticRows,
  setSimilarity,
} from "./synthetic.js";
import { resolveLabel } from "./labels.js";
import type { ResumeTrainingRow } from "./training-types.js";

function realRow(index: number): ResumeTrainingRow {
  return {
    resumeId: `real-${index}`,
    queryText: "React engineer",
    headlineTitle: "Engineer",
    summary: "Builds things",
    totalYearsExperience: 5,
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 100000,
    salaryExpectationMax: 150000,
    skills: ["React"],
    titles: ["Frontend Engineer"],
    workExperiences: [],
    posts: [],
    interactionScore: 2,
  };
}

describe("F7 — synthetic supervision is additive, not target-minus-real", () => {
  it("still generates negatives at 800 real rows", () => {
    // `syntheticCount = max(720 - dataset.length, 0)` hit zero at 720 real rows
    // and returned the dataset unchanged, so EVERY label-0 example vanished at
    // once and the model collapsed to predicting 1.0 for everybody. Nothing
    // about the data changed on row 721; the arithmetic did.
    const real = Array.from({ length: 800 }, (_, index) => realRow(index));

    const enriched = enrichDatasetWithSyntheticRows(real, {
      minimumSynthetic: 720,
      ratioToReal: 0.5,
      now: Date.UTC(2026, 0, 1),
    });

    const negatives = enriched.filter((row) => resolveLabel(row) === 0);

    expect(enriched.length).toBeGreaterThan(real.length);
    expect(negatives.length).toBeGreaterThan(100);
    expect(
      enriched.filter((row) => row.resumeId.startsWith("synthetic-negative-"))
        .length,
    ).toBeGreaterThan(100);
  });

  it("scales with the dataset once the ratio beats the floor", () => {
    const now = Date.UTC(2026, 0, 1);
    const small = enrichDatasetWithSyntheticRows(
      Array.from({ length: 10 }, (_, i) => realRow(i)),
      { minimumSynthetic: 100, ratioToReal: 0.5, now },
    );
    const large = enrichDatasetWithSyntheticRows(
      Array.from({ length: 1000 }, (_, i) => realRow(i)),
      { minimumSynthetic: 100, ratioToReal: 0.5, now },
    );

    expect(small.length - 10).toBe(100);
    expect(large.length - 1000).toBe(500);
  });

  it("uses the documented positive/negative ratio", () => {
    const enriched = enrichDatasetWithSyntheticRows([], {
      minimumSynthetic: 1000,
      ratioToReal: 0,
      now: Date.UTC(2026, 0, 1),
    });

    const positives = enriched.filter((row) =>
      row.resumeId.startsWith("synthetic-") &&
      !row.resumeId.startsWith("synthetic-negative-"),
    ).length;

    expect(positives / enriched.length).toBeCloseTo(SYNTHETIC_POSITIVE_RATIO, 2);
  });
});

describe("synthetic rows carry post evidence", () => {
  it("varies post count, commit share and recency with candidate quality", () => {
    const rows = createSyntheticDataset(24, Date.UTC(2026, 0, 1));

    const perfect = rows.filter((row) =>
      row.resumeId.startsWith("synthetic-perfect-"),
    );
    const weak = rows.filter((row) => row.resumeId.startsWith("synthetic-weak-"));

    expect(perfect.length).toBeGreaterThan(0);
    expect(weak.length).toBeGreaterThan(0);

    // Without this the v3 post features are identically zero across the whole
    // generated dataset — present in the vector, unlearnable by the model.
    expect(perfect.every((row) => row.posts.length === 3)).toBe(true);
    expect(
      perfect.every((row) =>
        row.posts.some((post) => post.source === "commit"),
      ),
    ).toBe(true);
    expect(weak.every((row) => row.posts.length === 0)).toBe(true);
  });

  it("gives cross-blueprint negatives posts too, in the WRONG stack", () => {
    const negatives = createCrossBlueprintNegatives(4, Date.UTC(2026, 0, 1));

    expect(negatives.every((row) => row.posts.length > 0)).toBe(true);
    expect(negatives.every((row) => row.interactionScore === 0)).toBe(true);
  });
});

describe("blueprint vocabulary", () => {
  it("covers every skill, title and post tag the generator depends on", () => {
    const vocabulary = blueprintVocabulary();

    expect(vocabulary.skills).toContain("React");
    expect(vocabulary.skills).toContain("Node.js");
    expect(vocabulary.skills).toContain("machine learning");
    expect(vocabulary.titles).toContain("Fullstack Engineer");
    expect(vocabulary.languages).toContain("english");
  });
});

describe("Task B equivalence — training target and runtime score are one function", () => {
  // `setSimilarity` is what the synthetic LABEL is built from; `matchCoverage`
  // is what the browser reranker scores with. They were Jaccard and coverage
  // respectively, so `blendScores` averaged the answers to two different
  // questions. This table is the lock.
  const cases: Array<[string, string[], string[]]> = [
    ["identical", ["react", "node.js"], ["react", "node.js"]],
    ["subset", ["react", "node.js"], ["react"]],
    ["superset", ["react"], ["react", "node.js", "docker", "aws"]],
    ["disjoint", ["react", "node.js"], ["swift", "uikit"]],
    ["case", ["React", "NODE.JS"], ["react", "node.js"]],
    ["whitespace", ["  react ", "node.js  "], ["react", " node.js"]],
    ["substring", ["react"], ["React Native"]],
    ["substring, partial", ["react", "vue"], ["React Native"]],
    ["empty request", [], ["react"]],
    ["empty candidate", ["react"], []],
    ["both empty", [], []],
    ["duplicates in request", ["react", "React", " react "], ["react"]],
    ["multi-word", ["machine learning"], ["Machine Learning", "Python"]],
    ["punctuation", ["node.js"], ["nodejs"]],
    ["no false substring", ["go"], ["mongodb", "django"]],
  ];

  it.each(cases)(
    "%s: setSimilarity === matchCoverage",
    (_label, expected, actual) => {
      const training = setSimilarity(expected, actual);
      const runtime = matchCoverage(expected, actual);

      expect(training).toBe(runtime);
      // Guards against the table passing vacuously if both sides ever became
      // a constant.
      expect(Number.isFinite(training)).toBe(true);
      expect(training).toBeGreaterThanOrEqual(0);
      expect(training).toBeLessThanOrEqual(1);
    },
  );

  it("the table actually exercises a range of values, not just 1s", () => {
    const values = new Set(
      cases.map(([, expected, actual]) => setSimilarity(expected, actual)),
    );
    expect(values.size).toBeGreaterThanOrEqual(3);
    expect(values.has(0)).toBe(true);
    expect(values.has(1)).toBe(true);
  });
});
