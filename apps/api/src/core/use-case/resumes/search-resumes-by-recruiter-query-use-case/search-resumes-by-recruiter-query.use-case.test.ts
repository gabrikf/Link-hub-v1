import { beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { SearchResumesByRecruiterQueryUseCase } from "./search-resumes-by-recruiter-query.use-case.js";

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
    expect(result[0]!.similarity).toBeGreaterThan(result[1]!.similarity);
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
});
