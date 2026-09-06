import { beforeEach, describe, expect, it } from "vitest";
import { CandidateInteractionEntity } from "../../../entity/candidate-interaction/candidate-interaction-entity.js";
import type {
  CreateCandidateInteractionInput,
  FindDuplicateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../repositories/candidate-interaction/candidate-interaction-repository.js";
import {
  INTERACTION_GUARDRAILS,
  InteractionRejectedError,
  RecordCandidateInteractionUseCase,
} from "./record-candidate-interaction.use-case.js";

class InMemoryCandidateInteractionRepository
  implements ICandidateInteractionRepository
{
  public readonly rows: CandidateInteractionEntity[] = [];

  /** Injectable so the dedup-window test can move time without sleeping. */
  constructor(private now: () => Date = () => new Date()) {}

  async create(
    input: CreateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity> {
    const entity = CandidateInteractionEntity.create({
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

    entity.createdAt = this.now();
    this.rows.push(entity);
    return entity;
  }

  async findDuplicate(
    input: FindDuplicateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity | null> {
    return (
      this.rows.find(
        (row) =>
          row.recruiterId === input.recruiterId &&
          row.resumeId === input.resumeId &&
          row.interactionType === input.interactionType &&
          (row.searchSessionId ?? null) === (input.searchSessionId ?? null) &&
          row.createdAt >= input.since,
      ) ?? null
    );
  }

  async countByRecruiterSince(
    recruiterId: string,
    since: Date,
  ): Promise<number> {
    return this.rows.filter(
      (row) => row.recruiterId === recruiterId && row.createdAt >= since,
    ).length;
  }

  async countDistinctResumesInSession(
    recruiterId: string,
    searchSessionId: string,
  ): Promise<number> {
    return new Set(
      this.rows
        .filter(
          (row) =>
            row.recruiterId === recruiterId &&
            row.searchSessionId === searchSessionId,
        )
        .map((row) => row.resumeId),
    ).size;
  }
}

const RECRUITER = "11111111-1111-4111-8111-111111111111";
const RESUME = "22222222-2222-4222-8222-222222222222";

function baseInput(
  overrides: Partial<CreateCandidateInteractionInput> = {},
): CreateCandidateInteractionInput {
  return {
    resumeId: RESUME,
    recruiterId: RECRUITER,
    interactionType: "EMAIL_COPY",
    queryText: "React engineer",
    displayedRank: 3,
    resultCount: 50,
    searchSessionId: "session-1",
    propensity: 0.4,
    ...overrides,
  };
}

describe("F14 — exposure context reaches the row", () => {
  let repository: InMemoryCandidateInteractionRepository;
  let useCase: RecordCandidateInteractionUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateInteractionRepository();
    useCase = new RecordCandidateInteractionUseCase(repository);
  });

  it("persists displayedRank, resultCount, searchSessionId and propensity", async () => {
    // These four were validated at the edge, had columns waiting for them, and
    // were then dropped by the controller and the repository — which is why
    // nothing downstream could correct for position bias.
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe("recorded");
    expect(result.interaction.displayedRank).toBe(3);
    expect(result.interaction.resultCount).toBe(50);
    expect(result.interaction.searchSessionId).toBe("session-1");
    expect(result.interaction.propensity).toBeCloseTo(0.4, 10);
  });

  it("accepts NOT_RELEVANT, the only explicit negative", async () => {
    const result = await useCase.execute(
      baseInput({ interactionType: "NOT_RELEVANT" }),
    );

    expect(result.interaction.interactionType).toBe("NOT_RELEVANT");
  });

  it("rejects exposure that cannot be true", async () => {
    await expect(
      useCase.execute(baseInput({ displayedRank: 80, resultCount: 50 })),
    ).rejects.toBeInstanceOf(InteractionRejectedError);

    expect(repository.rows).toHaveLength(0);
  });
});

describe("F4 — the training set is not writable at will", () => {
  let repository: InMemoryCandidateInteractionRepository;

  beforeEach(() => {
    repository = new InMemoryCandidateInteractionRepository();
  });

  it("refuses a candidate rating their own resume", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository, {
      findResumeOwnerId: async () => RECRUITER,
    });

    await expect(useCase.execute(baseInput())).rejects.toMatchObject({
      reason: "self-interaction",
    });
    expect(repository.rows).toHaveLength(0);
  });

  it("allows an interaction on someone else's resume", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository, {
      findResumeOwnerId: async () => "someone-else",
    });

    await expect(useCase.execute(baseInput())).resolves.toMatchObject({
      status: "recorded",
    });
  });

  it("collapses a repeated signal into the row that already carries it", async () => {
    // "I copied this email" five times is one preference, not five — and the
    // label sums interaction weights, so the repeats alone were enough to
    // saturate a candidate to a perfect 1.0.
    const useCase = new RecordCandidateInteractionUseCase(repository);

    const first = await useCase.execute(baseInput());
    const second = await useCase.execute(baseInput());

    expect(first.status).toBe("recorded");
    expect(second.status).toBe("duplicate");
    expect(second.interaction.id).toBe(first.interaction.id);
    expect(repository.rows).toHaveLength(1);
  });

  it("treats a different signal on the same candidate as a new row", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository);

    await useCase.execute(baseInput({ interactionType: "PROFILE_VIEW" }));
    const result = await useCase.execute(
      baseInput({ interactionType: "EMAIL_COPY" }),
    );

    expect(result.status).toBe("recorded");
    expect(repository.rows).toHaveLength(2);
  });

  it("treats the same signal in a later search session as a new row", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository);

    await useCase.execute(baseInput({ searchSessionId: "session-1" }));
    const result = await useCase.execute(
      baseInput({ searchSessionId: "session-2" }),
    );

    expect(result.status).toBe("recorded");
    expect(repository.rows).toHaveLength(2);
  });

  it("lets the same signal through again once the dedup window has passed", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const timedRepository = new InMemoryCandidateInteractionRepository(
      () => clock,
    );
    const useCase = new RecordCandidateInteractionUseCase(timedRepository, {
      now: () => clock,
    });

    await useCase.execute(baseInput());
    clock = new Date(
      clock.getTime() + INTERACTION_GUARDRAILS.dedupWindowMs + 60_000,
    );
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe("recorded");
    expect(timedRepository.rows).toHaveLength(2);
  });

  it("rate-limits a recruiter hammering the endpoint", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository);

    for (
      let index = 0;
      index < INTERACTION_GUARDRAILS.rateLimitMax;
      index += 1
    ) {
      await useCase.execute(
        baseInput({
          resumeId: `resume-${index}`,
          searchSessionId: `session-${index}`,
        }),
      );
    }

    expect(repository.rows).toHaveLength(INTERACTION_GUARDRAILS.rateLimitMax);

    await expect(
      useCase.execute(
        baseInput({ resumeId: "resume-over", searchSessionId: "session-over" }),
      ),
    ).rejects.toMatchObject({ reason: "rate-limited" });
  });

  it("caps how many candidates one search session may touch", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository);

    for (
      let index = 0;
      index < INTERACTION_GUARDRAILS.maxDistinctResumesPerSession;
      index += 1
    ) {
      await useCase.execute(baseInput({ resumeId: `resume-${index}` }));
    }

    await expect(
      useCase.execute(baseInput({ resumeId: "one-too-many" })),
    ).rejects.toMatchObject({ reason: "session-too-large" });
  });

  it("surfaces every rejection as a 400 with a machine-readable reason", async () => {
    const useCase = new RecordCandidateInteractionUseCase(repository, {
      findResumeOwnerId: async () => RECRUITER,
    });

    try {
      await useCase.execute(baseInput());
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(InteractionRejectedError);
      expect((error as InteractionRejectedError).statusCode).toBe(400);
      expect((error as InteractionRejectedError).reason).toBe(
        "self-interaction",
      );
    }
  });
});
