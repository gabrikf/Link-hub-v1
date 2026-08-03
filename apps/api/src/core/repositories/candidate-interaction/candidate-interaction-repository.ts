import {
  CandidateInteractionEntity,
  type CandidateInteractionType,
} from "../../entity/candidate-interaction/candidate-interaction-entity.js";

export interface CreateCandidateInteractionInput {
  resumeId: string;
  recruiterId: string;
  interactionType: CandidateInteractionType;
  queryText?: string | null;
  semanticSimilarity?: number | null;
  rankPosition?: number | null;
  metadata?: Record<string, unknown> | null;
  candidateSnapshot?: Record<string, unknown> | null;
  querySnapshot?: Record<string, unknown> | null;
  /** 1-based position the candidate occupied when the recruiter acted. */
  displayedRank?: number | null;
  /** Size of the result set at that moment. */
  resultCount?: number | null;
  /** Groups every interaction produced by one search. */
  searchSessionId?: string | null;
  /** Logged probability of exposure, for inverse-propensity weighting. */
  propensity?: number | null;
}

/** Narrow lookup used to keep one recruiter from writing the same signal twice. */
export interface FindDuplicateCandidateInteractionInput {
  recruiterId: string;
  resumeId: string;
  interactionType: CandidateInteractionType;
  searchSessionId?: string | null;
  /** Only rows created at or after this instant count as duplicates. */
  since: Date;
}

export interface ICandidateInteractionRepository {
  create(
    input: CreateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity>;

  /**
   * The existing row that makes a new one redundant, if any. Same recruiter,
   * same candidate, same signal, same search — writing it again only teaches
   * the model that this recruiter clicks a lot.
   */
  findDuplicate(
    input: FindDuplicateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity | null>;

  /** How many interactions this recruiter has written since `since`. */
  countByRecruiterSince(recruiterId: string, since: Date): Promise<number>;

  /**
   * How many *distinct* candidates this recruiter has already touched inside
   * one search session. A session that grows past a result page is not a
   * recruiter reading results.
   */
  countDistinctResumesInSession(
    recruiterId: string,
    searchSessionId: string,
  ): Promise<number>;
}
