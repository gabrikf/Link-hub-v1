export type ResumeEmbeddingJobReason =
  | "resume-upsert"
  | "resume-skill-added"
  | "resume-skills-replaced"
  | "resume-title-added"
  | "resume-titles-replaced";

export interface ResumeEmbeddingJobPayload {
  resumeId: string;
  userId: string;
  reason: ResumeEmbeddingJobReason;
  triggeredAt: string;
}

export interface IResumeEmbeddingQueue {
  enqueue(payload: ResumeEmbeddingJobPayload): Promise<void>;
}
