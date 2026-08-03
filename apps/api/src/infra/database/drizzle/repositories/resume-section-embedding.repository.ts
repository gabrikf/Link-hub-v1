import type { SearchSource } from "@repo/schemas";
import { and, eq } from "drizzle-orm";
import {
  IResumeSectionEmbeddingsRepository,
  ResumeSectionEmbeddingRecord,
  UpsertResumeSectionEmbeddingInput,
} from "../../../../core/repositories/resume-section-embedding/resume-section-embedding-repository.js";
import { db } from "../index.js";
import { resumeSectionEmbeddings } from "../schema.js";

export class DrizzleResumeSectionEmbeddingsRepository
  implements IResumeSectionEmbeddingsRepository
{
  async upsert(input: UpsertResumeSectionEmbeddingInput): Promise<void> {
    await db
      .insert(resumeSectionEmbeddings)
      .values({
        userId: input.userId,
        source: input.source,
        embedding: input.embedding,
        contentHash: input.contentHash,
        embeddingModel: input.embeddingModel,
        embeddingVersion: input.embeddingVersion,
        updatedAt: new Date(),
      })
      // Conflict target is the UNIQUE(user_id, source) constraint, not the
      // surrogate id: a re-index of the same source must overwrite in place
      // rather than pile up a second vector the search would then double-count.
      .onConflictDoUpdate({
        target: [resumeSectionEmbeddings.userId, resumeSectionEmbeddings.source],
        set: {
          embedding: input.embedding,
          contentHash: input.contentHash,
          embeddingModel: input.embeddingModel,
          embeddingVersion: input.embeddingVersion,
          updatedAt: new Date(),
        },
      });
  }

  async findByUserId(userId: string): Promise<ResumeSectionEmbeddingRecord[]> {
    const rows = await db
      .select()
      .from(resumeSectionEmbeddings)
      .where(eq(resumeSectionEmbeddings.userId, userId));

    return rows.map((row) => ({
      userId: row.userId,
      source: row.source as SearchSource,
      embedding: row.embedding,
      contentHash: row.contentHash,
      embeddingModel: row.embeddingModel,
      embeddingVersion: row.embeddingVersion,
      updatedAt: row.updatedAt,
    }));
  }

  async deleteByUserIdAndSource(
    userId: string,
    source: SearchSource,
  ): Promise<void> {
    await db
      .delete(resumeSectionEmbeddings)
      .where(
        and(
          eq(resumeSectionEmbeddings.userId, userId),
          eq(resumeSectionEmbeddings.source, source),
        ),
      );
  }
}
