export interface ResumeEmbeddingRecord {
  resumeId: string;
  userId: string;
  embedding: number[];
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: number;
  updatedAt: Date;
}

export interface UpsertResumeEmbeddingInput {
  resumeId: string;
  userId: string;
  embedding: number[];
  contentHash: string;
  embeddingModel: string;
  embeddingVersion: number;
}

export interface IResumeEmbeddingsRepository {
  upsert(input: UpsertResumeEmbeddingInput): Promise<void>;
  findByResumeId(resumeId: string): Promise<ResumeEmbeddingRecord | null>;
}
