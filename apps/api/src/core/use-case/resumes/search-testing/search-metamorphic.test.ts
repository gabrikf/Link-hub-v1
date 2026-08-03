import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { RecruiterSearchFilters } from "../../../repositories/resume-search/resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import {
  CorpusCandidate,
  SEARCH_CORPUS,
  searchTestEmbedder,
  seedCorpus,
} from "./search-corpus.js";

/**
 * Metamorphic tests: properties that must hold between *pairs* of searches.
 *
 * These are the assertions that survive a ranker change. "fullstack-1 scores
 * 0.83" is a fact about today's embedder and will be wrong tomorrow; "adding a
 * filter can only ever shrink the result set" is a fact about what search
 * means, and if it breaks, something is genuinely wrong. Nothing here compares
 * floats for exact equality except where the system is *required* to be
 * bit-deterministic — see the byte-identical test.
 */

const QUERY =
  "senior full stack engineer with react and node.js building typescript web applications";

/** Set overlap between two rankings, ignoring order. */
function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function makeSut(corpus: CorpusCandidate[] = SEARCH_CORPUS) {
  const repository = new InMemoryResumeSearchRepository();
  seedCorpus(repository, corpus);
  return new SearchResumesByRecruiterQueryUseCase(
    searchTestEmbedder,
    repository,
  );
}

async function idsFor(
  sut: SearchResumesByRecruiterQueryUseCase,
  query: string,
  topK = 10,
  filters?: RecruiterSearchFilters,
): Promise<string[]> {
  const results = await sut.execute({ query, topK, filters });
  return results.map((result) => result.resumeId);
}

describe("recruiter search — metamorphic properties", () => {
  let sut: SearchResumesByRecruiterQueryUseCase;

  beforeEach(() => {
    sut = makeSut();
  });

  it("is stable under neutral additions to the query", async () => {
    const base = await idsFor(sut, QUERY);
    const padded = await idsFor(
      sut,
      `${QUERY} please and thank you we are hiring right now for this position`,
    );

    // Words that carry no role information must not reshuffle the page. Jaccard
    // rather than exact equality: a small reordering is acceptable, a different
    // set of people is not.
    expect(jaccard(base, padded)).toBeGreaterThanOrEqual(0.8);
  });

  it("never demotes a candidate for repeating a skill the query asks for", async () => {
    const target = SEARCH_CORPUS.find((item) => item.id === "fullstack-2")!;
    const baseRank = (await idsFor(sut, QUERY, 50)).indexOf(target.id);

    const emphasised = makeSut(
      SEARCH_CORPUS.map((item) =>
        item.id === target.id
          ? { ...item, document: `${item.document} skill: react node.js` }
          : item,
      ),
    );
    const newRank = (await idsFor(emphasised, QUERY, 50)).indexOf(target.id);

    expect(baseRank).toBeGreaterThanOrEqual(0);
    expect(newRank).toBeGreaterThanOrEqual(0);
    // Rank, not score: a candidate saying "react" twice can only ever be at
    // least as relevant to a react query as saying it once.
    expect(newRank).toBeLessThanOrEqual(baseRank);
  });

  it("2 kB of irrelevant padding cannot improve a candidate's rank", async () => {
    const target = SEARCH_CORPUS.find((item) => item.id === "backend-1")!;
    const baseRank = (await idsFor(sut, QUERY, 50)).indexOf(target.id);

    const padding = Array.from(
      { length: 300 },
      (_, index) => `filler${index} lorem ipsum dolor`,
    ).join(" ");

    const stuffed = makeSut(
      SEARCH_CORPUS.map((item) =>
        item.id === target.id
          ? { ...item, document: `${item.document} ${padding}` }
          : item,
      ),
    );
    const newRank = (await idsFor(stuffed, QUERY, 50)).indexOf(target.id);

    // Keyword stuffing with unrelated text is the oldest ranking attack there
    // is. L2 normalisation is what makes it fail: the padding grows the norm
    // without adding anything the query aligns with.
    expect(newRank).toBeGreaterThanOrEqual(baseRank);
  });

  it("adding a hard filter can only shrink the result set", async () => {
    const unfiltered = await idsFor(sut, QUERY, 50);
    const filtered = await idsFor(sut, QUERY, 50, { workModels: ["remote"] });
    const doubleFiltered = await idsFor(sut, QUERY, 50, {
      workModels: ["remote"],
      seniorityLevels: ["senior"],
    });

    expect(filtered.length).toBeLessThanOrEqual(unfiltered.length);
    expect(doubleFiltered.length).toBeLessThanOrEqual(filtered.length);
    // Not merely smaller — a strict subset. A filter must never *introduce* a
    // candidate the unfiltered search did not have.
    for (const id of filtered) {
      expect(unfiltered).toContain(id);
    }
    for (const id of doubleFiltered) {
      expect(filtered).toContain(id);
    }
  });

  it("applies filters order-independently and idempotently", async () => {
    const forwards = await idsFor(sut, QUERY, 50, {
      workModels: ["remote"],
      seniorityLevels: ["senior"],
      spokenLanguages: ["English"],
    });

    // Same predicates, different insertion order in the object.
    const backwards = await idsFor(sut, QUERY, 50, {
      spokenLanguages: ["English"],
      seniorityLevels: ["senior"],
      workModels: ["remote"],
    });

    // And the same value repeated: a filter is a set membership test, so
    // asking twice must not change the answer.
    const idempotent = await idsFor(sut, QUERY, 50, {
      workModels: ["remote", "remote"],
      seniorityLevels: ["senior", "senior"],
      spokenLanguages: ["English", "English"],
    });

    expect(backwards).toEqual(forwards);
    expect(idempotent).toEqual(forwards);
  });

  it("returns byte-identical responses for identical requests", async () => {
    const first = await sut.execute({ query: QUERY, topK: 20 });
    const second = await sut.execute({ query: QUERY, topK: 20 });

    // Forces a total order on the ranking. Without a deterministic tie-break
    // two candidates on the same score come back in whatever order the storage
    // engine produced, and the same search shows a different page each time.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("keeps ties in a stable, documented order", async () => {
    // Three candidates with literally the same document: only the id can
    // separate them, and it must do so the same way every time.
    const tied = ["tie-c", "tie-a", "tie-b"].map((id) => ({
      ...SEARCH_CORPUS[0],
      id,
      name: id,
      username: id,
    }));

    const tiedSut = makeSut(tied);
    const ranked = await idsFor(tiedSut, QUERY, 10);

    expect(ranked).toEqual(["tie-a", "tie-b", "tie-c"]);
  });

  it("truncates rather than reorders when topK shrinks", async () => {
    const wide = await idsFor(sut, QUERY, 50);
    const narrow = await idsFor(sut, QUERY, 10);

    expect(narrow).toEqual(wide.slice(0, 10));
  });

  it("never returns a candidate who is not open to work", async () => {
    const ranked = await idsFor(sut, QUERY, 50);

    // Control first, otherwise this test passes for the wrong reason: a query
    // that matched nobody would satisfy `not.toContain` trivially.
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked).not.toContain("not-looking");

    // And prove the gate is what removed them rather than irrelevance. The same
    // corpus with the same query, differing only in the flag, ranks this exact
    // candidate near the top — so the gate has to beat relevance, not merely
    // agree with it.
    const openedUp = makeSut(
      SEARCH_CORPUS.map((item) =>
        item.id === "not-looking" ? { ...item, openToWork: true } : item,
      ),
    );

    expect((await idsFor(openedUp, QUERY, 50)).slice(0, 5)).toContain(
      "not-looking",
    );
  });
});
