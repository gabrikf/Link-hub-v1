import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  IResumeEmbeddingQueue,
  ResumeEmbeddingJobPayload,
} from "../../core/providers/queue/resume-embedding-queue.js";

export const RESUME_EMBEDDING_QUEUE_NAME = "resume-embedding";

function createConnection() {
  return new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });
}

export class BullMqResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  private readonly queue = new Queue<ResumeEmbeddingJobPayload>(
    RESUME_EMBEDDING_QUEUE_NAME,
    {
      connection: createConnection(),
    },
  );

  async enqueue(payload: ResumeEmbeddingJobPayload): Promise<void> {
    await this.queue.add("embed-resume", payload, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2_000,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
      jobId: payload.resumeId,
    });
  }
}
