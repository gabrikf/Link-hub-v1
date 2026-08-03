import { describe, expect, it } from "vitest";
import {
  PREPROCESSING_VERSION,
  PreprocessingCompatibilityError,
  assertPreprocessingCompatible,
  buildDefaultPreprocessingConfig,
  buildPreprocessingVocabulary,
  preprocessingInputDimension,
  toCandidateFeatureVector,
  toQueryCandidateFeatureVector,
  type CandidateFeaturesInput,
} from "./preprocessing.js";

const NOW = Date.UTC(2026, 0, 1);

function baseCandidate(
  overrides: Partial<CandidateFeaturesInput> = {},
): CandidateFeaturesInput {
  return {
    headlineTitle: "Fullstack Engineer",
    summary: "Ships product end to end",
    totalYearsExperience: 6,
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 100000,
    salaryExpectationMax: 160000,
    skills: ["React", "Node.js"],
    titles: ["Fullstack Engineer"],
    workExperiences: [],
    ...overrides,
  };
}

const config = buildDefaultPreprocessingConfig(
  ["sao paulo"],
  ["React", "Node.js", "Machine Learning"],
  ["Fullstack Engineer"],
  ["english", "portuguese", "german"],
  ["30 days"],
);

describe("preprocessing compatibility", () => {
  it("accepts a config at the current version", () => {
    expect(() => assertPreprocessingCompatible(config)).not.toThrow();
  });

  it("rejects a stale version with a named error", () => {
    // The failure this prevents: a v1 config (125 features) parsed cleanly next
    // to a v2 model (130 inputs) because `version` was only ever `z.string()`.
    const stale = { ...config, version: "v1" };

    expect(() => assertPreprocessingCompatible(stale)).toThrow(
      PreprocessingCompatibilityError,
    );

    try {
      assertPreprocessingCompatible(stale);
    } catch (error) {
      const typed = error as PreprocessingCompatibilityError;
      expect(typed.name).toBe("PreprocessingCompatibilityError");
      expect(typed.receivedVersion).toBe("v1");
      expect(typed.expectedVersion).toBe(PREPROCESSING_VERSION);
    }
  });

  it("rejects a config whose width does not match the model's input", () => {
    expect(() => assertPreprocessingCompatible(config, 999)).toThrow(
      PreprocessingCompatibilityError,
    );
  });

  it("predicts the exact width the encoder produces", () => {
    const vector = toQueryCandidateFeatureVector(
      { queryText: "react node.js", candidate: baseCandidate() },
      config,
      { now: NOW },
    );

    expect(preprocessingInputDimension(config)).toBe(vector.length);
    expect(() =>
      assertPreprocessingCompatible(config, vector.length),
    ).not.toThrow();
  });
});

describe("vocabulary construction", () => {
  it("reserves the terms the caller cannot afford to lose", () => {
    // Without reservations the blueprint skills fell off the end once ~25-30
    // real resumes existed, and the synthetic positives and negatives — built
    // from exactly those skills — became identical vectors with opposite labels.
    const noise = Array.from({ length: 400 }, (_, index) => `skill-${index}`);

    const { config: built, dropped } = buildPreprocessingVocabulary(
      [],
      noise,
      [],
      [],
      [],
      { skills: ["React", "Node.js", "TypeScript"] },
    );

    expect(built.knownSkills.slice(0, 3)).toEqual([
      "react",
      "node.js",
      "typescript",
    ]);
    expect(dropped.skills.length).toBeGreaterThan(0);
    expect(dropped.skills).not.toContain("react");
  });

  it("orders the rest by frequency, so rare one-off terms are what gets dropped", () => {
    const values = [
      ...Array.from({ length: 200 }, () => "common"),
      ...Array.from({ length: 300 }, (_, index) => `rare-${index}`),
    ];

    const { config: built } = buildPreprocessingVocabulary(
      [],
      values,
      [],
      [],
      [],
    );

    expect(built.knownSkills[0]).toBe("common");
  });
});

describe("post features", () => {
  it("encodes count, commit share and recency", () => {
    const without = toCandidateFeatureVector(baseCandidate(), config, {
      now: NOW,
    });
    const withPosts = toCandidateFeatureVector(
      baseCandidate({
        posts: [
          {
            title: "Shipping React",
            excerpt: "notes",
            source: "commit",
            tags: ["react"],
            publishedAt: new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
      config,
      { now: NOW },
    );

    // Indices 9, 10, 11 are postCount / commitShare / recency.
    expect(without.slice(9, 12)).toEqual([0, 0, 0]);
    expect(withPosts[9]).toBeGreaterThan(0);
    expect(withPosts[10]).toBe(1);
    expect(withPosts[11]).toBeGreaterThan(0.9);
  });

  it("decays recency and reaches zero beyond the horizon", () => {
    const old = toCandidateFeatureVector(
      baseCandidate({
        posts: [
          {
            title: null,
            excerpt: "old",
            source: "manual",
            tags: [],
            publishedAt: new Date(
              NOW - 900 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        ],
      }),
      config,
      { now: NOW },
    );

    expect(old[11]).toBe(0);
  });

  it("gives a candidate whose posts are about the query a higher post coverage", () => {
    const query = "Looking for a React engineer";

    const relevant = toQueryCandidateFeatureVector(
      {
        queryText: query,
        candidate: baseCandidate({
          posts: [
            {
              title: "React internals",
              excerpt: "react rendering",
              source: "commit",
              tags: ["React"],
              publishedAt: new Date(NOW).toISOString(),
            },
          ],
        }),
      },
      config,
      { now: NOW },
    );

    const irrelevant = toQueryCandidateFeatureVector(
      {
        queryText: query,
        candidate: baseCandidate({
          posts: [
            {
              title: "Machine learning notes",
              excerpt: "gradient descent",
              source: "manual",
              tags: ["Machine Learning"],
              publishedAt: new Date(NOW).toISOString(),
            },
          ],
        }),
      },
      config,
      { now: NOW },
    );

    // Last two features are postTagCoverage and postTextCoverage.
    expect(relevant.at(-2)!).toBeGreaterThan(irrelevant.at(-2)!);
  });
});

describe("language mention feature", () => {
  it("measures coverage of the REQUESTED language, not of the candidate's list", () => {
    // Reversed arguments used to score a polyglot who speaks the requested
    // language *lower* than a monoglot who speaks it.
    const query = "Engineer who speaks english";

    const polyglot = toQueryCandidateFeatureVector(
      {
        queryText: query,
        candidate: baseCandidate({
          spokenLanguages: ["english", "portuguese", "german"],
        }),
      },
      config,
      { now: NOW },
    );

    const monoglot = toQueryCandidateFeatureVector(
      {
        queryText: query,
        candidate: baseCandidate({ spokenLanguages: ["english"] }),
      },
      config,
      { now: NOW },
    );

    // languageMentionScore sits 5 from the end (before years, query length and
    // the two post features).
    const index = polyglot.length - 5;
    expect(polyglot[index]).toBe(1);
    expect(polyglot[index]).toBeGreaterThanOrEqual(monoglot[index]!);
  });
});

describe("query term extraction", () => {
  it("finds multi-word skills in the query text", () => {
    const vector = toQueryCandidateFeatureVector(
      {
        queryText: "Senior machine learning engineer",
        candidate: baseCandidate({ skills: ["Machine Learning"] }),
      },
      config,
      { now: NOW },
    );

    // querySkillCoverage is the second query-side feature.
    const candidateBlockLength =
      toCandidateFeatureVector(baseCandidate(), config, { now: NOW }).length;
    expect(vector[candidateBlockLength + 1]).toBe(1);
  });
});
