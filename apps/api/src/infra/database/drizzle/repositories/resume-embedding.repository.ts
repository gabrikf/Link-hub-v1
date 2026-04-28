import { eq } from "drizzle-orm";
import {
  IResumeEmbeddingsRepository,
  ResumeEmbeddingRecord,
  UpsertResumeEmbeddingInput,
} from "../../../../core/repositories/resume-embedding/resume-embedding-repository.js";
import { db } from "../index.js";
import { resumeEmbeddings } from "../schema.js";

export class DrizzleResumeEmbeddingsRepository
  implements IResumeEmbeddingsRepository
{
  async upsert(input: UpsertResumeEmbeddingInput): Promise<void> {
    await db
      .insert(resumeEmbeddings)
      .values({
        resumeId: input.resumeId,
        userId: input.userId,
        embedding: input.embedding,
        contentHash: input.contentHash,
        embeddingModel: input.embeddingModel,
        embeddingVersion: input.embeddingVersion,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: resumeEmbeddings.resumeId,
        set: {
          userId: input.userId,
          embedding: input.embedding,
          contentHash: input.contentHash,
          embeddingModel: input.embeddingModel,
          embeddingVersion: input.embeddingVersion,
          updatedAt: new Date(),
        },
      });
  }

  async findByResumeId(
    resumeId: string,
  ): Promise<ResumeEmbeddingRecord | null> {
    const [row] = await db
      .select()
      .from(resumeEmbeddings)
      .where(eq(resumeEmbeddings.resumeId, resumeId));

    if (!row) {
      return null;
    }

    return {
      resumeId: row.resumeId,
      userId: row.userId,
      embedding: row.embedding,
      contentHash: row.contentHash,
      embeddingModel: row.embeddingModel,
      embeddingVersion: row.embeddingVersion,
      updatedAt: row.updatedAt,
    };
  }
}
