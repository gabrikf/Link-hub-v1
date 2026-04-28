import { CandidateInteractionEntity } from "../../entity/candidate-interaction/candidate-interaction-entity.js";

export interface CreateCandidateInteractionInput {
  resumeId: string;
  recruiterId: string;
  interactionType: "EMAIL_COPY" | "CONTACT_CLICK" | "PROFILE_VIEW";
  queryText?: string | null;
  semanticSimilarity?: number | null;
  rankPosition?: number | null;
  metadata?: Record<string, unknown> | null;
  candidateSnapshot?: Record<string, unknown> | null;
  querySnapshot?: Record<string, unknown> | null;
}

export interface ICandidateInteractionRepository {
  create(
    input: CreateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity>;
}
