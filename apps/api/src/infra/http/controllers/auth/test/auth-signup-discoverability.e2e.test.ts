/**
 * The bug this file exists for:
 *
 * A recruiter searched "um dev react e node", a matching developer existed, and
 * the API answered 200 with an empty `candidates` array. The developer was
 * excluded by `users.open_to_work`, which defaulted to FALSE — so every account
 * was born undiscoverable and the failure was completely silent.
 *
 * The fix is a DEFAULT, not a gate change: a new signup is open to work unless
 * they say otherwise. That is only true if it survives the whole chain —
 * `POST /register` -> `CreateUserUseCase` -> `UserEntity` -> the users
 * repository -> the search predicate. Asserting the entity default alone would
 * pass while an insert that writes an explicit `false` quietly undoes it, which
 * is exactly the shape of failure that makes a "fix" ship and change nothing.
 *
 * Hermetic: `buildTestApp()` runs the real zod schemas, the real controller and
 * the real use case with in-memory repositories. The SQL half of the same claim
 * is in `../../resume/test/search-open-to-work-default.e2e.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../../../core/providers/embedding/embedding-provider.js";
import { InMemoryResumeSearchRepository } from "../../../../../core/repositories/resume-search/in-memory-resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "../../../../../core/use-case/resumes/search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SIGNUP = {
  email: "larry@example.com",
  login: "larry",
  name: "Larry",
  password: "password123",
};

/** The exact query from the report. */
const RECRUITER_QUERY = "um dev react e node";

/**
 * A tiny bag-of-words embedder over a fixed vocabulary.
 *
 * Deliberately not a constant vector: with a constant, every candidate scores
 * 1.0 against every query and "the search found them" would be true even if the
 * matching were completely broken. This one actually separates a React/Node
 * resume from a design resume, so a passing assertion means something.
 */
const VOCABULARY = [
  "react",
  "node",
  "typescript",
  "design",
  "figma",
  "kubernetes",
] as const;

class BagOfWordsEmbeddingProvider implements IEmbeddingProvider {
  async createEmbedding(text: string): Promise<number[]> {
    const tokens = text.toLowerCase().split(/[^a-z0-9]+/u);
    return VOCABULARY.map(
      (term) => tokens.filter((token) => token === term).length,
    );
  }
}

const embeddingProvider = new BagOfWordsEmbeddingProvider();

describe("Signup discoverability E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const register = (payload: Record<string, unknown> = SIGNUP) =>
    ctx.app.inject({
      method: "POST",
      url: "/register",
      headers: JSON_HEADERS,
      payload,
    });

  it("gives a newly registered account open-to-work, through the real register route", async () => {
    const response = await register();
    expect(response.statusCode).toBe(201);

    const stored = await ctx.usersRepository.findByLogin(SIGNUP.login);

    expect(stored).not.toBeNull();
    // The whole point. Not `?? true`, not "falsy is fine" — the persisted value.
    expect(stored!.openToWork).toBe(true);
  });

  /**
   * "It has to work even when only ONE developer is registered."
   *
   * Exactly one candidate in the corpus, seeded from the value the registration
   * path actually persisted rather than from a literal `true` — so if the
   * default regresses, this fails here rather than passing on a hard-coded
   * fixture.
   */
  it("finds the only registered developer from a plain-text query", async () => {
    await register();
    const registered = await ctx.usersRepository.findByLogin(SIGNUP.login);
    expect(registered).not.toBeNull();

    const searchRepository = new InMemoryResumeSearchRepository();
    searchRepository.seed({
      userId: registered!.id,
      resumeId: "larry-resume",
      username: registered!.login,
      name: registered!.name,
      email: registered!.email,
      embedding: await embeddingProvider.createEmbedding(
        "Full Stack Developer and AI Engineer TypeScript React Node",
      ),
      headlineTitle: "Full Stack Developer & AI Engineer",
      summary: "TypeScript, React, Node",
      contractType: null,
      seniorityLevel: null,
      workModel: null,
      location: null,
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: null,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      spokenLanguages: [],
      skills: ["React", "Node"],
      titles: ["Full Stack Developer"],
      openToWork: registered!.openToWork,
    });

    const sut = new SearchResumesByRecruiterQueryUseCase(
      embeddingProvider,
      searchRepository,
    );

    const results = await sut.execute({ query: RECRUITER_QUERY });

    expect(results).toHaveLength(1);
    expect(results[0]?.username).toBe(SIGNUP.login);
    expect(results[0]?.similarity).toBeGreaterThan(0);
  });

  /**
   * The gate itself is CORRECT and must keep working. Changing the default must
   * not turn "I am not looking right now" into a setting that does nothing.
   */
  it("still hides an account that turned open-to-work off", async () => {
    await register();
    const registered = await ctx.usersRepository.findByLogin(SIGNUP.login);

    registered!.updateOpenToWork(false);
    await ctx.usersRepository.update(registered!);

    const reread = await ctx.usersRepository.findByLogin(SIGNUP.login);
    expect(reread!.openToWork).toBe(false);

    const searchRepository = new InMemoryResumeSearchRepository();
    searchRepository.seed({
      userId: reread!.id,
      resumeId: "opted-out-resume",
      username: reread!.login,
      name: reread!.name,
      email: reread!.email,
      // Their own query vector: the nearest possible match, so a leak in the
      // gate returns them first rather than being hidden by a low score.
      embedding: await embeddingProvider.createEmbedding(RECRUITER_QUERY),
      headlineTitle: "Full Stack Developer",
      summary: "React and Node",
      contractType: null,
      seniorityLevel: null,
      workModel: null,
      location: null,
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: null,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      spokenLanguages: [],
      skills: [],
      titles: [],
      openToWork: reread!.openToWork,
    });

    const sut = new SearchResumesByRecruiterQueryUseCase(
      embeddingProvider,
      searchRepository,
    );

    expect(await sut.execute({ query: RECRUITER_QUERY })).toEqual([]);
  });
});
