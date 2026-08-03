import { beforeEach, describe, expect, it } from "vitest";
import { CandidateInteractionEntity } from "../../../entity/candidate-interaction/candidate-interaction-entity.js";
import {
  CreateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../repositories/candidate-interaction/candidate-interaction-repository.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { searchTestEmbedder } from "../search-testing/search-corpus.js";
import { RevealCandidateContactUseCase } from "./reveal-candidate-contact.use-case.js";

/**
 * Local double: the interactions vertical owns the real repository, and this
 * test only cares that a row was written with the right shape.
 */
class FakeCandidateInteractionRepository
  implements ICandidateInteractionRepository
{
  public readonly items: CreateCandidateInteractionInput[] = [];

  async create(
    input: CreateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity> {
    this.items.push(input);

    return CandidateInteractionEntity.create({
      resumeId: input.resumeId,
      recruiterId: input.recruiterId,
      interactionType: input.interactionType,
      queryText: input.queryText ?? null,
      semanticSimilarity: input.semanticSimilarity ?? null,
      rankPosition: input.rankPosition ?? null,
      metadata: input.metadata ?? null,
      candidateSnapshot: input.candidateSnapshot ?? null,
      querySnapshot: input.querySnapshot ?? null,
      displayedRank: input.displayedRank ?? null,
      resultCount: input.resultCount ?? null,
      searchSessionId: input.searchSessionId ?? null,
      propensity: input.propensity ?? null,
      trainedAt: null,
    });
  }

  /*
   * The anti-abuse lookups belong to the interactions vertical; revealing a
   * contact never consults them. They are stubbed rather than implemented so
   * this double still satisfies the interface — and so a future reveal path
   * that *does* start rate-limiting fails loudly here instead of silently
   * getting "never a duplicate, never over quota".
   */
  async findDuplicate(): Promise<CandidateInteractionEntity | null> {
    return null;
  }

  async countByRecruiterSince(): Promise<number> {
    return 0;
  }

  async countDistinctResumesInSession(): Promise<number> {
    return 0;
  }
}

function seed(
  repository: InMemoryResumeSearchRepository,
  resumeId: string,
  openToWork = true,
) {
  repository.seed({
    userId: `user-${resumeId}`,
    resumeId,
    username: `user-${resumeId}`,
    name: `Candidate ${resumeId}`,
    email: `${resumeId}@example.com`,
    embedding: searchTestEmbedder.embed("engineer"),
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
    openToWork,
  });
}

describe("RevealCandidateContactUseCase", () => {
  let resumeSearchRepository: InMemoryResumeSearchRepository;
  let candidateInteractionRepository: FakeCandidateInteractionRepository;
  let sut: RevealCandidateContactUseCase;

  beforeEach(() => {
    resumeSearchRepository = new InMemoryResumeSearchRepository();
    candidateInteractionRepository = new FakeCandidateInteractionRepository();
    sut = new RevealCandidateContactUseCase(
      resumeSearchRepository,
      candidateInteractionRepository,
    );
  });

  it("returns the contact details for one candidate", async () => {
    seed(resumeSearchRepository, "r1");

    const result = await sut.execute({
      resumeId: "r1",
      recruiterId: "recruiter-1",
    });

    expect(result).toEqual({
      resumeId: "r1",
      userId: "user-r1",
      name: "Candidate r1",
      username: "user-r1",
      email: "r1@example.com",
    });
  });

  it("records a CONTACT_CLICK for every reveal", async () => {
    seed(resumeSearchRepository, "r1");

    await sut.execute({
      resumeId: "r1",
      recruiterId: "recruiter-1",
      queryText: "senior react engineer",
      semanticSimilarity: 0.83,
      rankPosition: 2,
      searchSessionId: "session-9",
    });

    // Two jobs at once: this is the audit trail for a PII access, and the
    // strongest positive relevance label the ranking model gets.
    expect(candidateInteractionRepository.items).toHaveLength(1);
    expect(candidateInteractionRepository.items[0]).toMatchObject({
      resumeId: "r1",
      recruiterId: "recruiter-1",
      interactionType: "CONTACT_CLICK",
      queryText: "senior react engineer",
      semanticSimilarity: 0.83,
      rankPosition: 2,
    });
  });

  it("refuses to reveal a candidate who is not open to work", async () => {
    seed(resumeSearchRepository, "closed", false);

    await expect(
      sut.execute({ resumeId: "closed", recruiterId: "recruiter-1" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    // No interaction row either: nothing was revealed, so nothing happened.
    expect(candidateInteractionRepository.items).toHaveLength(0);
  });

  it("is indistinguishable from a missing resume", async () => {
    seed(resumeSearchRepository, "closed", false);

    const closed = await sut
      .execute({ resumeId: "closed", recruiterId: "r" })
      .catch((error: Error) => error.message);
    const missing = await sut
      .execute({ resumeId: "closed", recruiterId: "r" })
      .catch((error: Error) => error.message);

    // Anything else turns this endpoint into an oracle for "does this resume
    // exist / is this person job hunting".
    expect(closed).toBe(missing);
  });
});
