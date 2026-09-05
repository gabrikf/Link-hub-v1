import { describe, expect, it } from "vitest";
import {
  buildSearchZeroResultDiagnostics,
  type SearchZeroResultContext,
  type SearchZeroResultCounts,
} from "./search-zero-result-diagnostics.js";

const context: SearchZeroResultContext = {
  topK: 50,
  minSimilarity: 0.1,
  embeddingModel: "text-embedding-3-small",
  embeddingVersion: "1",
  filterKeys: [],
};

function counts(
  overrides: Partial<SearchZeroResultCounts> = {},
): SearchZeroResultCounts {
  return {
    totalResumes: 0,
    matchingRecruiterFilters: 0,
    excludedByOpenToWork: 0,
    missingCurrentEmbedding: 0,
    belowSimilarityFloor: 0,
    ...overrides,
  };
}

describe("buildSearchZeroResultDiagnostics", () => {
  it("names an empty corpus rather than blaming a gate", () => {
    const result = buildSearchZeroResultDiagnostics(counts(), context);

    expect(result.likelyCause).toBe("no-resumes");
  });

  /**
   * The reported bug, reduced to numbers: one developer exists, they are the
   * only possible match, and `open_to_work = false` removed them. Before this
   * the recruiter and the log saw the same thing they see for a genuine
   * no-match — nothing.
   */
  it("names the open-to-work gate when it removed the whole population", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 1,
        matchingRecruiterFilters: 1,
        excludedByOpenToWork: 1,
      }),
      context,
    );

    expect(result.likelyCause).toBe("open-to-work-gate");
    expect(result.survivors.afterOpenToWorkGate).toBe(0);
    expect(result.reason).toContain("open-to-work");
  });

  it("names the embedding generation when nobody has a current vector", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 10,
        matchingRecruiterFilters: 10,
        excludedByOpenToWork: 2,
        missingCurrentEmbedding: 8,
      }),
      context,
    );

    expect(result.likelyCause).toBe("missing-current-embedding");
    expect(result.survivors.afterOpenToWorkGate).toBe(8);
    expect(result.survivors.afterEmbeddingGeneration).toBe(0);
  });

  it("names the similarity floor when candidates were scored and all fell short", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 10,
        matchingRecruiterFilters: 10,
        excludedByOpenToWork: 0,
        missingCurrentEmbedding: 3,
        belowSimilarityFloor: 7,
      }),
      context,
    );

    expect(result.likelyCause).toBe("below-similarity-floor");
    expect(result.survivors.afterSimilarityFloor).toBe(0);
  });

  /**
   * The ladder, not a max(). With the open-to-work gate having already removed
   * everyone, the 300 below the floor are an artefact of counting, not the
   * cause — reporting them would send the next reader to tune a threshold that
   * had nothing to do with it.
   */
  it("reports only the FIRST gate that emptied the population", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 300,
        matchingRecruiterFilters: 300,
        excludedByOpenToWork: 300,
        missingCurrentEmbedding: 300,
        belowSimilarityFloor: 300,
      }),
      context,
    );

    expect(result.likelyCause).toBe("open-to-work-gate");
  });

  it("blames the recruiter's own filters when they matched no resume at all", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({ totalResumes: 100, matchingRecruiterFilters: 0 }),
      { ...context, filterKeys: ["seniorityLevels", "locations"] },
    );

    expect(result.likelyCause).toBe("recruiter-filters");
    expect(result.survivors.afterRecruiterFilters).toBe(0);
    expect(result.filterKeys).toEqual(["seniorityLevels", "locations"]);
  });

  /**
   * The residual case, and the most valuable one. Candidates cleared every
   * predicate on an exact scan, so the only thing left that can have dropped
   * them is the approximate index never opening their clusters — recall
   * collapse, which produces no error and no warning of its own.
   */
  it("names ANN recall when candidates clear every predicate and still nothing came back", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 100,
        matchingRecruiterFilters: 90,
        excludedByOpenToWork: 10,
        missingCurrentEmbedding: 5,
        belowSimilarityFloor: 20,
      }),
      context,
    );

    expect(result.likelyCause).toBe("ann-recall");
    expect(result.survivors.afterSimilarityFloor).toBe(55);
  });

  /**
   * The three counts come from four independent `count(*) FILTER (...)`
   * aggregates. A future edit that makes them overlap must not produce a
   * negative survivor count and a nonsensical cause.
   */
  it("never reports a negative survivor count", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 5,
        matchingRecruiterFilters: 5,
        excludedByOpenToWork: 5,
        missingCurrentEmbedding: 5,
        belowSimilarityFloor: 5,
      }),
      context,
    );

    expect(result.survivors.afterOpenToWorkGate).toBe(0);
    expect(result.survivors.afterEmbeddingGeneration).toBe(0);
    expect(result.survivors.afterSimilarityFloor).toBe(0);
  });

  it("carries the search knobs through so the log line is self-contained", () => {
    const result = buildSearchZeroResultDiagnostics(counts(), {
      ...context,
      sources: ["posts"],
    });

    expect(result.topK).toBe(50);
    expect(result.minSimilarity).toBeCloseTo(0.1, 10);
    expect(result.embeddingModel).toBe("text-embedding-3-small");
    expect(result.embeddingVersion).toBe("1");
    expect(result.sources).toEqual(["posts"]);
  });

  /**
   * Counts only. A diagnostic that leaked who was excluded would put candidate
   * PII into a log line that exists precisely because it gets read by people
   * debugging someone else's account.
   *
   * Asserted as a closed key set rather than a substring scan: "no PII" is a
   * statement about what the payload MAY contain, and a substring scan quietly
   * stops testing anything the moment a new field is added.
   */
  it("exposes a closed set of fields, all of them counts or knobs", () => {
    const result = buildSearchZeroResultDiagnostics(
      counts({
        totalResumes: 1,
        matchingRecruiterFilters: 1,
        excludedByOpenToWork: 1,
      }),
      { ...context, sources: ["profile"], filterKeys: ["usernameContains"] },
    );

    expect(Object.keys(result).sort((a, b) => a.localeCompare(b))).toEqual([
      "counts",
      "embeddingModel",
      "embeddingVersion",
      "filterKeys",
      "likelyCause",
      "minSimilarity",
      "reason",
      "sources",
      "survivors",
      "topK",
    ]);
  });

  /**
   * `nameContains` and `profileTextContains` are free text a recruiter typed
   * about a person. The KEY is the diagnostic signal; the VALUE never is.
   */
  it("keeps recruiter filter values out of the payload", () => {
    const serialised = JSON.stringify(
      buildSearchZeroResultDiagnostics(
        counts({ totalResumes: 4, matchingRecruiterFilters: 4 }),
        {
          ...context,
          filterKeys: ["nameContains", "profileTextContains"],
        },
      ),
    );

    expect(serialised).toContain("nameContains");
    expect(serialised).not.toContain("Ada Lovelace");
    expect(serialised).not.toContain("@");
  });
});
