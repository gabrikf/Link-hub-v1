import { describe, expect, it } from "vitest";
import type { RecruiterSearchResult } from "@repo/schemas";
import {
  PREPROCESSING_VERSION,
  PreprocessingCompatibilityError,
  assertPreprocessingCompatible,
  buildDefaultPreprocessingConfig,
} from "@repo/schemas";
import {
  computeAlignmentScore,
  resolveRequestedTerms,
  salaryOverlapScore,
  toCandidateFeatureInput,
  type SearchInputPayload,
} from "./reranker.worker";

function candidate(
  overrides: Partial<RecruiterSearchResult> = {},
): RecruiterSearchResult {
  return {
    userId: "user-1",
    resumeId: "resume-1",
    username: "ada",
    name: "Ada Lovelace",
    userPhoto: null,
    profileDescription: null,
    similarity: 0.4,
    email: null,
    headlineTitle: "Mobile Engineer",
    summary: "Ships apps",
    totalYearsExperience: 6,
    location: "lisbon",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    skills: [],
    titles: [],
    workExperiences: [],
    workEvidence: [],
    ...overrides,
  } as RecruiterSearchResult;
}

const emptyCatalog = { skills: [] as string[], titles: [] as string[] };

describe("F9/F11 — a mandatory skill matched by substring is not a mismatch", () => {
  it("scores a React Native candidate above zero on a mandatory react filter", () => {
    // The SQL filter admits this candidate: `lower(name) LIKE '%react%'` matches
    // "React Native". The worker then scored the 4x-weighted skills bucket 0 and
    // showed them as a "Weak match" — for matching exactly what was required.
    const searchInput = {
      semanticQuery: "react engineer",
      filters: { skills: ["react"] },
    };

    const requested = resolveRequestedTerms(searchInput, emptyCatalog);
    const score = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React Native", "TypeScript"] }),
      requested,
    );

    expect(requested.skills).toEqual(["react"]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBe(1);
  });

  it("still scores a genuinely unrelated candidate at zero", () => {
    // Without this, the test above would pass just as happily if the metric
    // returned 1 for everything.
    const searchInput = {
      semanticQuery: "react engineer",
      filters: { skills: ["react"] },
    };

    expect(
      computeAlignmentScore(
        searchInput,
        candidate({ skills: ["Swift", "UIKit"] }),
        resolveRequestedTerms(searchInput, emptyCatalog),
      ),
    ).toBe(0);
  });

  it("gives partial credit for partial coverage", () => {
    const searchInput = {
      semanticQuery: "",
      filters: { skills: ["react", "node.js"] },
    };

    expect(
      computeAlignmentScore(
        searchInput,
        candidate({ skills: ["React Native"] }),
        resolveRequestedTerms(searchInput, emptyCatalog),
      ),
    ).toBe(0.5);
  });
});

describe("F10 — requested terms come from a catalog, not from the result set", () => {
  const catalog = {
    skills: ["React", "Node.js", "Machine Learning", "Rust"],
    titles: ["Fullstack Engineer"],
  };

  it("keeps a requested skill that nobody in the result set has", () => {
    // The vocabulary used to be built from the RETURNED candidates, so a skill
    // nobody had was dropped from the request, the weight-4 bucket was skipped,
    // and everyone scored high precisely because nobody matched.
    const searchInput = { semanticQuery: "rust engineer wanted", filters: {} };
    const requested = resolveRequestedTerms(searchInput, catalog);

    expect(requested.skills).toContain("Rust");

    const nonMatching = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"] }),
      requested,
    );
    const matching = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["Rust"] }),
      requested,
    );

    // Both halves matter. A dropped request would ALSO score 0 here (no
    // buckets at all), so the contrast is what proves the bucket ran.
    expect(nonMatching).toBe(0);
    expect(matching).toBe(1);
  });

  it("finds multi-word skills that a word splitter can never produce", () => {
    const searchInput = {
      semanticQuery: "senior machine learning engineer",
      filters: {},
    };

    expect(resolveRequestedTerms(searchInput, catalog).skills).toContain(
      "Machine Learning",
    );
  });

  it("prefers structured query-conversion output over prose", () => {
    const searchInput = {
      semanticQuery: "we need someone great",
      filters: {},
      semanticSkills: ["Kubernetes"],
    };

    expect(resolveRequestedTerms(searchInput, catalog).skills).toEqual([
      "Kubernetes",
    ]);
  });

  it("lets a mandatory filter beat everything else", () => {
    const searchInput = {
      semanticQuery: "react",
      filters: { skills: ["Terraform"] },
      semanticSkills: ["Kubernetes"],
    };

    expect(resolveRequestedTerms(searchInput, catalog).skills).toEqual([
      "Terraform",
    ]);
  });
});

describe("F24 — the base bucket no longer scores what SQL already enforced", () => {
  it("does not separate two candidates on a hard filter they both passed", () => {
    // seniority/work model/contract/location/notice/relocation/years are hard
    // filters, so scoring them added a constant 1 to every candidate and
    // discriminated nothing.
    // `satisfies` rather than a bare literal: the enum-typed filter arrays widen
    // to `string[]` on their own and stop matching `SearchInputPayload`.
    const searchInput = {
      semanticQuery: "",
      filters: {
        skills: ["react"],
        seniorityLevels: ["senior"],
        workModels: ["remote"],
        locations: ["lisbon"],
        minYearsExperience: 3,
      },
    } satisfies SearchInputPayload;
    const requested = resolveRequestedTerms(searchInput, emptyCatalog);

    const a = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"] }),
      requested,
    );
    const b = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"], location: "porto", seniorityLevel: "mid" }),
      requested,
    );

    expect(a).toBe(b);
  });

  it("still separates candidates on language coverage, which genuinely varies", () => {
    const searchInput = {
      semanticQuery: "",
      filters: { skills: ["react"], spokenLanguages: ["english", "german"] },
    };
    const requested = resolveRequestedTerms(searchInput, emptyCatalog);

    const bilingual = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"], spokenLanguages: ["english", "german"] }),
      requested,
    );
    const monolingual = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"], spokenLanguages: ["english"] }),
      requested,
    );

    expect(bilingual).toBeGreaterThan(monolingual);
  });
});

describe("salaryOverlapScore", () => {
  it("does not penalise a candidate who declared no expectation", () => {
    // The old signal scored `salaryExpectationMax` against BOTH bounds and
    // returned 0 when it was null, so a candidate who had passed the SQL salary
    // filter was punished for leaving the field blank.
    expect(
      salaryOverlapScore(
        { minSalary: 100000, maxSalary: 150000 },
        { salaryExpectationMin: null, salaryExpectationMax: null },
      ),
    ).toBeNull();
  });

  it("is skipped when no salary was requested", () => {
    expect(
      salaryOverlapScore(
        {},
        { salaryExpectationMin: 1, salaryExpectationMax: 2 },
      ),
    ).toBeNull();
  });

  it("credits an overlapping band and rejects a disjoint one", () => {
    expect(
      salaryOverlapScore(
        { minSalary: 100000, maxSalary: 150000 },
        { salaryExpectationMin: 140000, salaryExpectationMax: 200000 },
      ),
    ).toBe(1);

    expect(
      salaryOverlapScore(
        { minSalary: 100000, maxSalary: 150000 },
        { salaryExpectationMin: 200000, salaryExpectationMax: 260000 },
      ),
    ).toBe(0);
  });

  it("keeps a blank-salary candidate level with a matching-salary one", () => {
    const searchInput = {
      semanticQuery: "",
      filters: { skills: ["react"], minSalary: 100000, maxSalary: 150000 },
    };
    const requested = resolveRequestedTerms(searchInput, emptyCatalog);

    const undeclared = computeAlignmentScore(
      searchInput,
      candidate({ skills: ["React"] }),
      requested,
    );
    const matching = computeAlignmentScore(
      searchInput,
      candidate({
        skills: ["React"],
        salaryExpectationMin: 110000,
        salaryExpectationMax: 140000,
      }),
      requested,
    );

    expect(undeclared).toBe(matching);
  });
});

describe("post evidence reaches the model input", () => {
  it("maps workEvidence onto the encoder's posts field", () => {
    // The worker used to drop `workEvidence` while building its input, so the
    // post features were structurally zero at serve time regardless of what the
    // model had learned.
    const input = toCandidateFeatureInput(
      candidate({
        workEvidence: [
          {
            id: "post-1",
            title: "Shipping React",
            excerpt: "notes",
            source: "commit",
            tags: ["react"],
            publishedAt: new Date("2026-01-01T00:00:00Z"),
            externalUrl: null,
          },
        ],
      }),
    );

    expect(input.posts).toHaveLength(1);
    expect(input.posts[0]).toMatchObject({ source: "commit", tags: ["react"] });
  });

  it("counts published work as evidence when there is no job history", () => {
    const searchInput = {
      semanticQuery: "",
      filters: { skills: ["react"] },
    };
    const requested = resolveRequestedTerms(searchInput, emptyCatalog);

    const withEvidence = computeAlignmentScore(
      searchInput,
      candidate({
        skills: ["React"],
        workEvidence: [
          {
            id: "post-1",
            title: "Shipping React",
            excerpt: "notes",
            source: "commit",
            tags: ["react"],
            publishedAt: new Date("2026-01-01T00:00:00Z"),
            externalUrl: null,
          },
        ],
      }),
      requested,
    );

    expect(withEvidence).toBe(1);
  });
});

describe("F16 — a mismatched preprocessing config is rejected by name", () => {
  const config = buildDefaultPreprocessingConfig(
    ["lisbon"],
    ["React"],
    ["Engineer"],
    ["english"],
    ["30 days"],
  );

  it("throws PreprocessingCompatibilityError for an older version", () => {
    let thrown: unknown;
    try {
      assertPreprocessingCompatible({ ...config, version: "v1" }, 125);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PreprocessingCompatibilityError);
    expect((thrown as PreprocessingCompatibilityError).name).toBe(
      "PreprocessingCompatibilityError",
    );
    expect((thrown as PreprocessingCompatibilityError).receivedVersion).toBe(
      "v1",
    );
  });

  it("throws when the width disagrees with the model even at the right version", () => {
    expect(config.version).toBe(PREPROCESSING_VERSION);
    expect(() => assertPreprocessingCompatible(config, 999)).toThrow(
      PreprocessingCompatibilityError,
    );
  });

  it("accepts a config that matches on both axes", () => {
    expect(() => assertPreprocessingCompatible(config)).not.toThrow();
  });
});
