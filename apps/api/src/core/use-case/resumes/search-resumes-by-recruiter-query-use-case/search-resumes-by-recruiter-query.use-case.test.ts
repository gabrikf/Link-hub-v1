import { beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "./search-resumes-by-recruiter-query.use-case.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

class FakeEmbeddingProvider implements IEmbeddingProvider {
  async createEmbedding(): Promise<number[]> {
    return [1, 0, 0];
  }
}

describe("SearchResumesByRecruiterQueryUseCase", () => {
  let resumeSearchRepository: InMemoryResumeSearchRepository;
  let sut: SearchResumesByRecruiterQueryUseCase;

  beforeEach(() => {
    resumeSearchRepository = new InMemoryResumeSearchRepository();
    sut = new SearchResumesByRecruiterQueryUseCase(
      new FakeEmbeddingProvider(),
      resumeSearchRepository,
    );
  });

  it("returns topK ordered by similarity with filters", async () => {
    resumeSearchRepository.seed({
      userId: "u1",
      resumeId: "r1",
      email: "u1@example.com",
      embedding: [0.9, 0.1, 0],
      headlineTitle: "Senior Backend Engineer",
      summary: "Node and Postgres",
      contractType: "pj",
      seniorityLevel: "senior",
      workModel: "remote",
      location: "BR",
      noticePeriod: null,
      openToRelocation: true,
      totalYearsExperience: 8,
      salaryExpectationMin: 100000,
      salaryExpectationMax: 160000,
      spokenLanguages: ["English"],
      skills: ["Node.js", "PostgreSQL"],
      titles: ["Backend Engineer"],
    });

    resumeSearchRepository.seed({
      userId: "u2",
      resumeId: "r2",
      email: "u2@example.com",
      embedding: [0.3, 0.7, 0],
      headlineTitle: "Software Engineer",
      summary: "Generalist",
      contractType: "pj",
      seniorityLevel: "senior",
      workModel: "remote",
      location: "BR",
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: 7,
      salaryExpectationMin: 90000,
      salaryExpectationMax: 130000,
      spokenLanguages: ["English"],
      skills: ["TypeScript"],
      titles: ["Engineer"],
    });

    const result = await sut.execute({
      query: "senior backend engineer",
      topK: 50,
      filters: {
        contractTypes: ["pj"],
        seniorityLevels: ["senior"],
        locations: ["BR"],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.resumeId).toBe("r1");
    expect(
      expectDefined(result[0], "the top result").similarity,
    ).toBeGreaterThan(expectDefined(result[1], "the runner-up").similarity);
  });

  it("caps topK at 100", async () => {
    for (let index = 0; index < 120; index += 1) {
      resumeSearchRepository.seed({
        userId: `u-${index}`,
        resumeId: `r-${index}`,
        email: `u-${index}@example.com`,
        embedding: [0.9, 0.1, 0],
        headlineTitle: "Senior Engineer",
        summary: null,
        contractType: "pj",
        seniorityLevel: "senior",
        workModel: "remote",
        location: "BR",
        noticePeriod: null,
        openToRelocation: false,
        totalYearsExperience: index,
        salaryExpectationMin: null,
        salaryExpectationMax: null,
        spokenLanguages: [],
        skills: [],
        titles: [],
      });
    }

    const result = await sut.execute({
      query: "backend",
      topK: 1000,
    });

    expect(result).toHaveLength(100);
  });

  it("defaults to top 50 candidates when topK is not provided", async () => {
    for (let index = 0; index < 80; index += 1) {
      resumeSearchRepository.seed({
        userId: `u-${index}`,
        resumeId: `r-${index}`,
        email: `u-${index}@example.com`,
        embedding: [0.9, 0.1, 0],
        headlineTitle: "Engineer",
        summary: null,
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
      });
    }

    const result = await sut.execute({ query: "backend" });

    expect(result).toHaveLength(50);
  });

  it("ranks candidates from best to worst match (descending similarity)", async () => {
    const seeds = [
      { id: "best", embedding: [1, 0, 0] },
      { id: "good", embedding: [0.8, 0.2, 0] },
      { id: "ok", embedding: [0.5, 0.5, 0] },
      { id: "weak", embedding: [0.2, 0.8, 0] },
    ];

    for (const seed of seeds) {
      resumeSearchRepository.seed({
        userId: seed.id,
        resumeId: seed.id,
        email: `${seed.id}@example.com`,
        embedding: seed.embedding,
        headlineTitle: "Engineer",
        summary: null,
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
      });
    }

    // Query vector aligned with the "best" candidate.
    const result = await sut.execute({ query: "backend", topK: 100 });

    expect(result.map((item) => item.resumeId)).toEqual([
      "best",
      "good",
      "ok",
      "weak",
    ]);

    for (let index = 0; index < result.length - 1; index += 1) {
      expect(result[index]?.similarity).toBeGreaterThanOrEqual(
        expectDefined(result[index + 1], `result ${String(index + 1)}`)
          .similarity,
      );
    }
  });

  it("excludes candidates that fail a hard required filter", async () => {
    resumeSearchRepository.seed({
      userId: "match",
      resumeId: "match",
      email: "match@example.com",
      embedding: [1, 0, 0],
      headlineTitle: "Senior Engineer",
      summary: null,
      contractType: "pj",
      seniorityLevel: "senior",
      workModel: "remote",
      location: "BR",
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: 9,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      spokenLanguages: ["English"],
      skills: ["Go"],
      titles: ["Engineer"],
    });

    // Higher semantic similarity, but wrong seniority — must be filtered out so
    // the recruiter never sees an unqualified candidate ranked first.
    resumeSearchRepository.seed({
      userId: "junior",
      resumeId: "junior",
      email: "junior@example.com",
      embedding: [1, 0, 0],
      headlineTitle: "Junior Engineer",
      summary: null,
      contractType: "pj",
      seniorityLevel: "junior",
      workModel: "remote",
      location: "BR",
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: 1,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      spokenLanguages: ["English"],
      skills: ["Go"],
      titles: ["Engineer"],
    });

    const result = await sut.execute({
      query: "senior backend engineer",
      filters: {
        seniorityLevels: ["senior"],
        minYearsExperience: 5,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.resumeId).toBe("match");
  });

  it("combines multiple hard filters (language + work model)", async () => {
    const base = {
      summary: null,
      contractType: "pj",
      seniorityLevel: "senior",
      location: "BR",
      noticePeriod: null,
      openToRelocation: false,
      totalYearsExperience: 6,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      skills: [],
      titles: [],
    };

    resumeSearchRepository.seed({
      ...base,
      userId: "qualified",
      resumeId: "qualified",
      email: "qualified@example.com",
      embedding: [1, 0, 0],
      headlineTitle: "Engineer",
      workModel: "remote",
      spokenLanguages: ["English", "Spanish"],
    });

    resumeSearchRepository.seed({
      ...base,
      userId: "wrong-model",
      resumeId: "wrong-model",
      email: "wrong-model@example.com",
      embedding: [1, 0, 0],
      headlineTitle: "Engineer",
      workModel: "onsite",
      spokenLanguages: ["English"],
    });

    resumeSearchRepository.seed({
      ...base,
      userId: "wrong-language",
      resumeId: "wrong-language",
      email: "wrong-language@example.com",
      embedding: [1, 0, 0],
      headlineTitle: "Engineer",
      workModel: "remote",
      spokenLanguages: ["Portuguese"],
    });

    const result = await sut.execute({
      query: "engineer",
      filters: {
        workModels: ["remote"],
        spokenLanguages: ["English"],
      },
    });

    expect(result.map((item) => item.resumeId)).toEqual(["qualified"]);
  });
});
