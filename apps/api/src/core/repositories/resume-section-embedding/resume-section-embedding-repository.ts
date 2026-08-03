import type { SearchSource } from "@repo/schemas";

/**
 * One per-source vector for a candidate, keyed by (userId, source).
 *
 * Separate from `resume_embeddings` (one blended vector per resume) so a
 * recruiter can scope a search: "who has actually shipped this?" reads the
 * `posts` vector, "who claims this?" reads `profile`.
 */
export interface ResumeSectionEmbeddingRecord {
  userId: string;
  source: SearchSource;
  embedding: number[];
  contentHash: string;
  embeddingModel: string;
  /**
   * Stored as text — `resume_section_embeddings.embedding_version` is a text
   * column, unlike the integer on `resume_embeddings`. Kept as the column's own
   * type rather than coerced, so a mismatch is visible instead of silently
   * becoming `NaN`.
   */
  embeddingVersion: string;
  updatedAt: Date;
}

export interface UpsertResumeSectionEmbeddingInput {
  userId: string;
  source: SearchSource;
  embedding: number[];
  contentHash: string;
  embeddingModel: string;
  embeddingVersion: string;
}

export interface IResumeSectionEmbeddingsRepository {
  upsert(input: UpsertResumeSectionEmbeddingInput): Promise<void>;
  findByUserId(userId: string): Promise<ResumeSectionEmbeddingRecord[]>;
  /**
   * Drops a source's vector. Called when a candidate deletes the last thing
   * that fed it: a stale `posts` vector would keep matching posts-scoped
   * searches for content that no longer exists.
   */
  deleteByUserIdAndSource(userId: string, source: SearchSource): Promise<void>;
}
