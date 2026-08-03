import { and, countDistinct, eq, gte, isNull, sql } from "drizzle-orm";
import {
  CandidateInteractionEntity,
  type CandidateInteractionType,
} from "../../../../core/entity/candidate-interaction/candidate-interaction-entity.js";
import {
  CreateCandidateInteractionInput,
  FindDuplicateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../../core/repositories/candidate-interaction/candidate-interaction-repository.js";
import { db } from "../index.js";
import { candidateInteractions } from "../schema.js";

type CandidateInteractionRow = typeof candidateInteractions.$inferSelect;

function toEntity(row: CandidateInteractionRow): CandidateInteractionEntity {
  return new CandidateInteractionEntity({
    id: row.id,
    resumeId: row.resumeId,
    recruiterId: row.recruiterId,
    interactionType: row.interactionType as CandidateInteractionType,
    queryText: row.queryText,
    semanticSimilarity: row.semanticSimilarity,
    rankPosition: row.rankPosition,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    candidateSnapshot: (row.candidateSnapshot ?? null) as Record<
      string,
      unknown
    > | null,
    querySnapshot: (row.querySnapshot ?? null) as Record<
      string,
      unknown
    > | null,
    displayedRank: row.displayedRank,
    resultCount: row.resultCount,
    searchSessionId: row.searchSessionId,
    propensity: row.propensity,
    trainedAt: row.trainedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

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
        // These four were accepted by the request schema and had columns waiting
        // for them, and were then silently dropped right here — which is why
        // nothing downstream could correct for position bias.
        displayedRank: input.displayedRank ?? null,
        resultCount: input.resultCount ?? null,
        searchSessionId: input.searchSessionId ?? null,
        propensity: input.propensity ?? null,
      })
      .returning();

    return toEntity(created);
  }

  async findDuplicate(
    input: FindDuplicateCandidateInteractionInput,
  ): Promise<CandidateInteractionEntity | null> {
    const [existing] = await db
      .select()
      .from(candidateInteractions)
      .where(
        and(
          eq(candidateInteractions.recruiterId, input.recruiterId),
          eq(candidateInteractions.resumeId, input.resumeId),
          eq(candidateInteractions.interactionType, input.interactionType),
          gte(candidateInteractions.createdAt, input.since),
          // A missing session is its own bucket: two interactions with no
          // session context are only duplicates of each other.
          input.searchSessionId
            ? eq(candidateInteractions.searchSessionId, input.searchSessionId)
            : isNull(candidateInteractions.searchSessionId),
        ),
      )
      .limit(1);

    return existing ? toEntity(existing) : null;
  }

  async countByRecruiterSince(
    recruiterId: string,
    since: Date,
  ): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(candidateInteractions)
      .where(
        and(
          eq(candidateInteractions.recruiterId, recruiterId),
          gte(candidateInteractions.createdAt, since),
        ),
      );

    return row?.total ?? 0;
  }

  async countDistinctResumesInSession(
    recruiterId: string,
    searchSessionId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ total: countDistinct(candidateInteractions.resumeId) })
      .from(candidateInteractions)
      .where(
        and(
          eq(candidateInteractions.recruiterId, recruiterId),
          eq(candidateInteractions.searchSessionId, searchSessionId),
        ),
      );

    return Number(row?.total ?? 0);
  }
}
