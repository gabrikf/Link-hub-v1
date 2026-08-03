import type { SearchSource } from "@repo/schemas";
import {
  IResumeSectionEmbeddingsRepository,
  ResumeSectionEmbeddingRecord,
  UpsertResumeSectionEmbeddingInput,
} from "./resume-section-embedding-repository.js";

export class InMemoryResumeSectionEmbeddingsRepository
  implements IResumeSectionEmbeddingsRepository
{
  public readonly items: ResumeSectionEmbeddingRecord[] = [];

  async upsert(input: UpsertResumeSectionEmbeddingInput): Promise<void> {
    // Mirrors the UNIQUE(user_id, source) constraint in Postgres.
    const existingIndex = this.items.findIndex(
      (item) => item.userId === input.userId && item.source === input.source,
    );

    const nextValue: ResumeSectionEmbeddingRecord = {
      userId: input.userId,
      source: input.source,
      embedding: input.embedding,
      contentHash: input.contentHash,
      embeddingModel: input.embeddingModel,
      embeddingVersion: input.embeddingVersion,
      updatedAt: new Date(),
    };

    if (existingIndex === -1) {
      this.items.push(nextValue);
      return;
    }

    this.items[existingIndex] = nextValue;
  }

  async findByUserId(userId: string): Promise<ResumeSectionEmbeddingRecord[]> {
    return this.items.filter((item) => item.userId === userId);
  }

  async deleteByUserIdAndSource(
    userId: string,
    source: SearchSource,
  ): Promise<void> {
    const index = this.items.findIndex(
      (item) => item.userId === userId && item.source === source,
    );

    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }
}
