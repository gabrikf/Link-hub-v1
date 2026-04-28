import {
  IResumeEmbeddingsRepository,
  ResumeEmbeddingRecord,
  UpsertResumeEmbeddingInput,
} from "./resume-embedding-repository.js";

export class InMemoryResumeEmbeddingsRepository
  implements IResumeEmbeddingsRepository
{
  private readonly items: ResumeEmbeddingRecord[] = [];

  async upsert(input: UpsertResumeEmbeddingInput): Promise<void> {
    const existingIndex = this.items.findIndex(
      (item) => item.resumeId === input.resumeId,
    );

    const nextValue: ResumeEmbeddingRecord = {
      resumeId: input.resumeId,
      userId: input.userId,
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

  async findByResumeId(
    resumeId: string,
  ): Promise<ResumeEmbeddingRecord | null> {
    return this.items.find((item) => item.resumeId === resumeId) ?? null;
  }
}
