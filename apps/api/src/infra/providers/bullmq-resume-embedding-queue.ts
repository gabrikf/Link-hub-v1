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

/**
 * Window in which repeat enqueues for the same resume collapse into one job.
 *
 * Short on purpose. This must never behave like a permanent idempotency key:
 * a resume is re-embedded every time its work history, skills or titles change
 * ({@link reembedResumeForUser}), so a key that outlives the job would freeze
 * the vector at its first value and silently rot search ranking. A minute is
 * long enough to absorb the burst of writes one edit session produces, short
 * enough that the next real change always gets its own job.
 */
export const RESUME_EMBEDDING_DEDUPLICATION_TTL_MS = 60_000;

export interface BullMqResumeEmbeddingQueueOptions {
  /** Overridable so a test can drive an isolated queue. */
  queueName?: string;
  /** Overridable so a test can watch the window open and close. */
  deduplicationTtlMs?: number;
}

export class BullMqResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  private readonly queue: Queue<ResumeEmbeddingJobPayload>;
  private readonly deduplicationTtlMs: number;

  constructor(options: BullMqResumeEmbeddingQueueOptions = {}) {
    this.queue = new Queue<ResumeEmbeddingJobPayload>(
      options.queueName ?? RESUME_EMBEDDING_QUEUE_NAME,
      { connection: createConnection() },
    );
    this.deduplicationTtlMs =
      options.deduplicationTtlMs ?? RESUME_EMBEDDING_DEDUPLICATION_TTL_MS;
  }

  /**
   * Note on what is deliberately NOT used here: `jobId`. BullMQ keys a job by
   * its id for as long as the job record exists, and `removeOnComplete: 1000`
   * keeps the last thousand completed jobs — so `jobId: resumeId` made the very
   * first enqueue for a resume the only one that ever ran, and every later
   * re-embed was silently dropped. `deduplication` is the option that expresses
   * "coalesce a burst", and unlike a job id it expires.
   */
  async enqueue(payload: ResumeEmbeddingJobPayload): Promise<void> {
    await this.queue.add("embed-resume", payload, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2_000,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
      deduplication: {
        id: payload.resumeId,
        ttl: this.deduplicationTtlMs,
      },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
