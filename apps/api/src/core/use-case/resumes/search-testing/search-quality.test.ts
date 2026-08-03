import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateRun, type EvalRun } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import { GOLDEN_QUERIES, toQrelsByQuery } from "./golden-queries.fixture.js";
import { searchTestEmbedder, seedCorpus } from "./search-corpus.js";

/**
 * Retrieval-quality regression gate.
 *
 * The gate is RELATIVE, not absolute. An absolute floor ("nDCG@10 must exceed
 * 0.8") is either so low it never fires or so high it blocks unrelated work,
 * and it says nothing about whether a change made retrieval better or worse.
 * A band against a committed baseline answers the only question that matters:
 * did this change move quality, and by how much. Regenerate the baseline
 * deliberately — `UPDATE_SEARCH_BASELINE=1 npx vitest run search-quality` —
 * so the number always lands in a diff someone reviewed.
 */

const BASELINE_PATH = fileURLToPath(
  new URL("./search-quality.baseline.json", import.meta.url),
);

/**
 * How far each metric may fall below the baseline before the test fails.
 *
 * 2% absolute: with 6 queries a single query slipping one rank moves the mean
 * by roughly this much, so a tighter band would fail on noise that is not a
 * quality change; a looser one would let a real regression through.
 */
const REGRESSION_TOLERANCE = 0.02;

interface Baseline {
  ndcgAt10: number;
  recallAt50: number;
  mrr: number;
  mapAt10: number;
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

describe("recruiter search quality (golden set)", () => {
  let repository: InMemoryResumeSearchRepository;
  let sut: SearchResumesByRecruiterQueryUseCase;

  beforeEach(() => {
    repository = new InMemoryResumeSearchRepository();
    seedCorpus(repository);
    sut = new SearchResumesByRecruiterQueryUseCase(
      searchTestEmbedder,
      repository,
    );
  });

  async function runGoldenSet(topK: number): Promise<EvalRun[]> {
    const runs: EvalRun[] = [];

    for (const query of GOLDEN_QUERIES) {
      const results = await sut.execute({ query: query.query, topK });
      runs.push({
        queryId: query.id,
        ranked: results.map((result) => result.resumeId),
      });
    }

    return runs;
  }

  it("every golden query has judgements", async () => {
    const runs = await runGoldenSet(10);
    const report = evaluateRun(runs, toQrelsByQuery(), 10);

    // An unjudged query is a hole in the golden set, and `evaluateRun`
    // deliberately reports it instead of scoring it as zero.
    expect(report.unjudgedQueryIds).toEqual([]);
    expect(report.queryCount).toBe(GOLDEN_QUERIES.length);
  });

  it("does not regress against the committed baseline", async () => {
    const at10 = evaluateRun(await runGoldenSet(10), toQrelsByQuery(), 10);
    const at50 = evaluateRun(await runGoldenSet(50), toQrelsByQuery(), 50);

    const measured: Baseline = {
      ndcgAt10: at10.ndcgAtK,
      recallAt50: at50.recallAtK,
      mrr: at10.mrr,
      mapAt10: at10.mapAtK,
    };

    if (process.env.UPDATE_SEARCH_BASELINE === "1") {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(measured, null, 2)}\n`,
        "utf8",
      );
    }

    const baseline = readBaseline();

    for (const key of Object.keys(baseline) as Array<keyof Baseline>) {
      expect(
        measured[key],
        `${key} regressed: ${measured[key].toFixed(4)} vs baseline ${baseline[
          key
        ].toFixed(4)}`,
      ).toBeGreaterThanOrEqual(baseline[key] - REGRESSION_TOLERANCE);
    }
  });

  it("ranks the ideal candidate first for every unambiguous query", async () => {
    // A weaker but absolute sanity check that survives baseline regeneration:
    // if the top hit for "ios engineer swift" stops being the iOS engineer,
    // something is broken in a way a relative band could still absorb.
    const expectations: Record<string, string[]> = {
      "q2-ios-native": ["mobile-1"],
      "q3-data-pipelines": ["data-1"],
      "q4-kubernetes-sre": ["devops-1", "devops-2"],
      "q5-machine-learning": ["ml-1"],
    };

    for (const query of GOLDEN_QUERIES) {
      const expected = expectations[query.id];
      if (!expected) {
        continue;
      }

      const results = await sut.execute({ query: query.query, topK: 10 });
      expect(expected, `top hit for ${query.id}`).toContain(
        results[0]?.resumeId,
      );
    }
  });
});
