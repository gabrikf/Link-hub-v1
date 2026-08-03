import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import {
  SEARCH_CORPUS,
  searchTestEmbedder,
  seedCorpus,
} from "./search-corpus.js";

/**
 * `sources` is the feature that separates "who claims this?" from "who has
 * actually shipped this?". These tests pin the contract end of it: which
 * candidates are comparable at all, how the per-source scores are fused, and
 * that leaving `sources` out changes nothing.
 */
describe("recruiter search — per-source scoping", () => {
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

  it("omitting sources keeps the blended behaviour untouched", async () => {
    const blended = await sut.execute({ query: "react node.js", topK: 20 });
    const emptySources = await sut.execute({
      query: "react node.js",
      topK: 20,
      sources: [],
    });

    // Both rankings being empty would satisfy the equality below for free.
    expect(blended.length).toBeGreaterThan(0);
    expect(emptySources.map((item) => item.resumeId)).toEqual(
      blended.map((item) => item.resumeId),
    );
    // No per-source breakdown when nothing was scoped: the field exists to
    // explain a scoped score, and inventing one for the blended path would be
    // a lie about which vectors were compared.
    expect(blended.every((item) => item.sourceSimilarity === undefined)).toBe(
      true,
    );
  });

  it("only returns candidates that have a vector for a selected source", async () => {
    // Just four candidates in the corpus have a `posts` document.
    const results = await sut.execute({
      query: "kubernetes terraform",
      topK: 50,
      sources: ["posts"],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.map((item) => item.resumeId).sort()).toEqual(
      ["backend-1", "data-1", "devops-1", "fullstack-1", "ml-1"].sort(),
    );
  });

  it("reports a similarity per searched source", async () => {
    const [top] = await sut.execute({
      query: "kubernetes terraform aws clusters",
      topK: 5,
      sources: ["profile", "posts"],
    });

    expect(top?.resumeId).toBe("devops-1");
    expect(Object.keys(top!.sourceSimilarity!).sort()).toEqual([
      "posts",
      "profile",
    ]);
    // The headline score is the fused one, so it can never be below any of the
    // parts it was fused from.
    for (const value of Object.values(top!.sourceSimilarity!)) {
      expect(top!.similarity).toBeGreaterThanOrEqual(value - 1e-9);
    }
  });

  it("fuses with max, so the score equals the best matching source", async () => {
    const [top] = await sut.execute({
      query: "shipping a graphql gateway in node.js",
      topK: 5,
      sources: ["profile", "work", "posts"],
    });

    const parts = Object.values(top!.sourceSimilarity!);
    expect(top!.similarity).toBeCloseTo(Math.max(...parts), 10);
  });

  it("widening the source set can only raise a candidate's score", async () => {
    const query = "shipping a graphql gateway in node.js";

    const narrow = await sut.execute({ query, topK: 50, sources: ["profile"] });
    const wide = await sut.execute({
      query,
      topK: 50,
      sources: ["profile", "posts"],
    });

    const wideById = new Map(wide.map((item) => [item.resumeId, item]));

    // This is the property `max` fusion buys us, and the reason a weighted sum
    // was rejected: adding evidence must never make a candidate look worse.
    for (const candidate of narrow) {
      const widened = wideById.get(candidate.resumeId);
      expect(widened).toBeDefined();
      expect(widened!.similarity).toBeGreaterThanOrEqual(
        candidate.similarity - 1e-9,
      );
    }
  });

  it("scoping to posts finds the person who shipped it, not the one who lists it", async () => {
    // `devops-1` writes about kubernetes upgrades; `devops-2` merely lists
    // kubernetes as a skill. A posts-scoped search must prefer the former.
    const posts = await sut.execute({
      query: "zero downtime kubernetes upgrades in production",
      topK: 10,
      sources: ["posts"],
    });

    expect(posts[0]?.resumeId).toBe("devops-1");
    expect(posts.map((item) => item.resumeId)).not.toContain("devops-2");
  });

  it("still hides candidates who are not open to work", async () => {
    const query = "typescript react node.js";
    const results = await sut.execute({ query, topK: 50, sources: ["profile"] });

    // Control: without this the assertion below would also pass for a query
    // that simply matched nobody on the scoped path.
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((item) => item.resumeId)).not.toContain("not-looking");

    // Scoping must not become a way around the gate: the same candidate does
    // have a `profile` vector, and it ranks — the flag is what excludes them.
    const openedUp = new InMemoryResumeSearchRepository();
    seedCorpus(
      openedUp,
      SEARCH_CORPUS.map((item) =>
        item.id === "not-looking" ? { ...item, openToWork: true } : item,
      ),
    );

    const withoutGate = await new SearchResumesByRecruiterQueryUseCase(
      searchTestEmbedder,
      openedUp,
    ).execute({ query, topK: 50, sources: ["profile"] });

    expect(withoutGate.map((item) => item.resumeId)).toContain("not-looking");
  });

  it("never leaks an email through the scoped path either", async () => {
    const results = await sut.execute({
      query: "react node.js",
      topK: 10,
      sources: ["profile"],
    });

    // `every` over an empty array is `true`, so prove there was something to
    // check before checking it.
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.email === null)).toBe(true);
  });
});
