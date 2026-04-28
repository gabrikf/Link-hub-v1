import { CandidateInteractionEntity } from "../../../../core/entity/candidate-interaction/candidate-interaction-entity.js";
import {
  CreateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../../core/repositories/candidate-interaction/candidate-interaction-repository.js";
import { db } from "../index.js";
import { candidateInteractions } from "../schema.js";

export class DrizzleCandidateInteractionRepository
  implements ICandidateInteractionRepository
{
  async create(
    input: CreateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity> {
    const [created] = await db
      .insert(candidateInteractions)
      .values({
        resumeId: input.resumeId,
        recruiterId: input.recruiterId,
        interactionType: input.interactionType,
        queryText: input.queryText ?? null,
        semanticSimilarity: input.semanticSimilarity ?? null,
        rankPosition: input.rankPosition ?? null,
        metadata: input.metadata ?? null,
        candidateSnapshot: (input.candidateSnapshot ?? null) as Record<
          string,
          unknown
        > | null,
        querySnapshot: (input.querySnapshot ?? null) as Record<
          string,
          unknown
        > | null,
      })
      .returning();

    return new CandidateInteractionEntity({
      id: created.id,
      resumeId: created.resumeId,
      recruiterId: created.recruiterId,
      interactionType: created.interactionType as
        | "EMAIL_COPY"
        | "CONTACT_CLICK"
        | "PROFILE_VIEW",
      queryText: created.queryText,
      semanticSimilarity: created.semanticSimilarity,
      rankPosition: created.rankPosition,
      metadata: (created.metadata ?? null) as Record<string, unknown> | null,
      candidateSnapshot: (created.candidateSnapshot ?? null) as Record<
        string,
        unknown
      > | null,
      querySnapshot: (created.querySnapshot ?? null) as Record<
        string,
        unknown
      > | null,
      trainedAt: created.trainedAt,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }
}
