import {
  IResumeEmbeddingQueue,
  ResumeEmbeddingJobReason,
} from "../../../providers/queue/resume-embedding-queue.js";

export interface IEnqueueResumeEmbeddingInput {
  resumeId: string;
  userId: string;
  reason: ResumeEmbeddingJobReason;
}

export class EnqueueResumeEmbeddingUseCase {
  constructor(private resumeEmbeddingQueue: IResumeEmbeddingQueue) {}

  async execute(input: IEnqueueResumeEmbeddingInput): Promise<void> {
    await this.resumeEmbeddingQueue.enqueue({
      resumeId: input.resumeId,
      userId: input.userId,
      reason: input.reason,
      triggeredAt: new Date().toISOString(),
    });
  }
}
