import { BadRequestError } from "../../../errors/index.js";
import { CandidateInteractionEntity } from "../../../entity/candidate-interaction/candidate-interaction-entity.js";
import {
  CreateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../repositories/candidate-interaction/candidate-interaction-repository.js";

/**
 * Everything below exists because `POST /interactions` is a direct write into
 * the training set. It used to accept an arbitrary `resumeId`, an arbitrary
 * `interactionType` and an arbitrary `queryText`, unlimited times, with no check
 * that the candidate had ever appeared in this user's results — so any
 * authenticated account could hand-write the label distribution the reranker
 * learns from, and a candidate could rate themselves to the top.
 *
 * The limits are deliberately generous: a recruiter working a 50-result page
 * hard will not reach them.
 */
export const INTERACTION_GUARDRAILS = {
  /** Same recruiter + candidate + signal inside this window is ONE signal. */
  dedupWindowMs: 24 * 60 * 60 * 1000,
  /** Ceiling on writes per recruiter per window. */
  rateLimitWindowMs: 60 * 60 * 1000,
  rateLimitMax: 400,
  /**
   * A search session can only have shown so many candidates (the UI asks for
   * 50). Past this, the "session" is a script, not a page being read.
   */
  maxDistinctResumesPerSession: 120,
} as const;

export type InteractionRejectionReason =
  | "self-interaction"
  | "rate-limited"
  | "session-too-large"
  | "inconsistent-exposure";

export type RecordCandidateInteractionResult = {
  /**
   * `duplicate` returns the row that already carried this signal, so the
   * endpoint stays idempotent instead of failing a best-effort client call.
   */
  status: "recorded" | "duplicate";
  interaction: CandidateInteractionEntity;
};

export interface RecordCandidateInteractionDeps {
  /** Resolves the resume's owner, or null when the resume does not exist. */
  findResumeOwnerId?: (resumeId: string) => Promise<string | null>;
  now?: () => Date;
}

export class RecordCandidateInteractionUseCase {
  constructor(
    private candidateInteractionRepository: ICandidateInteractionRepository,
    private deps: RecordCandidateInteractionDeps = {},
  ) {}

  async execute(
    input: CreateCandidateInteractionInput,
  ): Promise<RecordCandidateInteractionResult> {
    const now = this.deps.now?.() ?? new Date();

    // Exposure has to be internally consistent, or the position-bias correction
    // downstream computes IPS weights from fiction.
    if (
      input.displayedRank != null &&
      input.resultCount != null &&
      input.displayedRank > input.resultCount
    ) {
      throw new InteractionRejectedError("inconsistent-exposure");
    }

    // Rating your own profile is the cheapest possible attack on the model.
    const ownerId = await this.deps.findResumeOwnerId?.(input.resumeId);
    if (ownerId != null && ownerId === input.recruiterId) {
      throw new InteractionRejectedError("self-interaction");
    }

    const recentCount =
      await this.candidateInteractionRepository.countByRecruiterSince(
        input.recruiterId,
        new Date(now.getTime() - INTERACTION_GUARDRAILS.rateLimitWindowMs),
      );

    if (recentCount >= INTERACTION_GUARDRAILS.rateLimitMax) {
      throw new InteractionRejectedError("rate-limited");
    }

    if (input.searchSessionId) {
      const sessionSize =
        await this.candidateInteractionRepository.countDistinctResumesInSession(
          input.recruiterId,
          input.searchSessionId,
        );

      if (sessionSize >= INTERACTION_GUARDRAILS.maxDistinctResumesPerSession) {
        throw new InteractionRejectedError("session-too-large");
      }
    }

    // Dedup. "I copied this email" repeated five times is one preference, not
    // five — and the label sums interaction weights, so the repeats alone were
    // enough to saturate a candidate to a perfect 1.0.
    const duplicate = await this.candidateInteractionRepository.findDuplicate({
      recruiterId: input.recruiterId,
      resumeId: input.resumeId,
      interactionType: input.interactionType,
      searchSessionId: input.searchSessionId ?? null,
      since: new Date(now.getTime() - INTERACTION_GUARDRAILS.dedupWindowMs),
    });

    if (duplicate) {
      return { status: "duplicate", interaction: duplicate };
    }

    const interaction = await this.candidateInteractionRepository.create(input);
    return { status: "recorded", interaction };
  }
}

/** 400 with a machine-readable reason, so the client can tell them apart. */
export class InteractionRejectedError extends BadRequestError {
  constructor(readonly reason: InteractionRejectionReason) {
    super(`Interaction rejected: ${reason}`);
  }
}
