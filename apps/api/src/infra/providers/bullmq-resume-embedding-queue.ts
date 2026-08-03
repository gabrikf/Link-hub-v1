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
 * Debounce window for re-embedding a resume.
 *
 * This is a DEBOUNCE, not a plain deduplication window, and the distinction is
 * the whole bug this constant exists to prevent. BullMQ starts a deduplication
 * TTL at the first `add`, not at job completion, and an undelayed job runs
 * within milliseconds. So the previous "collapse a burst" design did this:
 *
 *   t=0ms    PUT /me/resume            -> enqueue, window opens
 *   t=200ms  worker embeds the resume  -> vector built with NO skills/titles
 *   t=2s     PUT /resume/skills/bulk   -> enqueue DROPPED (still inside window)
 *   t=3s     PUT /resume/titles/bulk   -> enqueue DROPPED
 *   ...      vector stays wrong until some unrelated edit >60s later
 *
 * Skills carry weight 4 in the embedding document, so that silently produced
 * the worst possible vector for the most common save flow in the product.
 *
 * Pairing the window with an equal `delay` fixes it: the burst still collapses
 * into one job, but that job only runs once the window has closed, and it
 * re-reads everything from the database — so it always sees the final state.
 * Any enqueue arriving after the window gets its own job, as before.
 */
export const RESUME_EMBEDDING_DEBOUNCE_MS = 60_000;

export interface BullMqResumeEmbeddingQueueOptions {
  /** Overridable so a test can drive an isolated queue. */
  queueName?: string;
  /** Overridable so a test can watch the window open and close. */
  debounceMs?: number;
}

export class BullMqResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  private readonly queue: Queue<ResumeEmbeddingJobPayload>;
  private readonly debounceMs: number;

  constructor(options: BullMqResumeEmbeddingQueueOptions = {}) {
    this.queue = new Queue<ResumeEmbeddingJobPayload>(
      options.queueName ?? RESUME_EMBEDDING_QUEUE_NAME,
      { connection: createConnection() },
    );
    this.debounceMs = options.debounceMs ?? RESUME_EMBEDDING_DEBOUNCE_MS;
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
      // `delay` and the deduplication `ttl` are deliberately the same value:
      // together they are the debounce. The window swallows the follow-up
      // enqueues an edit session produces, and the delay holds the single
      // surviving job back until that window has closed, so it reads the
      // finished resume rather than a half-saved one.
      delay: this.debounceMs,
      deduplication: {
        id: payload.resumeId,
        ttl: this.debounceMs,
      },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
