import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { setupContainer, TOKENS, resolve } from "../di/container.js";
import { ResumeEmbeddingJobPayload } from "../../core/providers/queue/resume-embedding-queue.js";
import { ProcessResumeEmbeddingJobUseCase } from "../../core/use-case/resumes/process-resume-embedding-job-use-case/process-resume-embedding-job.use-case.js";
import { RESUME_EMBEDDING_QUEUE_NAME } from "../providers/bullmq-resume-embedding-queue.js";
import { telemetryConfig } from "../config/app-config.js";
import {
  queueJobDuration,
  queueJobWaitDuration,
  queueJobsTotal,
} from "../observability/metrics.js";
import {
  captureApiException,
  flushSentry,
  initSentry,
} from "../observability/sentry.js";
import { closeRedis } from "../redis/redis-client.js";

initSentry();
setupContainer();

/**
 * The only label these metrics carry. Job id and user id are deliberately
 * absent — see the cardinality rule in `observability/metrics.ts`; they belong
 * on the log line and the Sentry scope, where they cost nothing per-series.
 */
const QUEUE_LABELS = { queue: RESUME_EMBEDDING_QUEUE_NAME };

const worker = new Worker<ResumeEmbeddingJobPayload>(
  RESUME_EMBEDDING_QUEUE_NAME,
  async (job) => {
    const startedAt = Date.now();

    /**
     * Queue lag: how long the job sat before a worker picked it up. This is the
     * number that says "add another worker", and it is invisible in the
     * processing duration.
     */
    if (job.processedOn) {
      queueJobWaitDuration.record(
        (job.processedOn - job.timestamp) / 1000,
        QUEUE_LABELS,
      );
    }

    const processUseCase = resolve<ProcessResumeEmbeddingJobUseCase>(
      TOKENS.ProcessResumeEmbeddingJobUseCase,
    );

    try {
      await processUseCase.execute(job.data);
      queueJobsTotal.add(1, { ...QUEUE_LABELS, outcome: "completed" });
    } catch (error) {
      queueJobsTotal.add(1, { ...QUEUE_LABELS, outcome: "failed" });
      throw error;
    } finally {
      queueJobDuration.record((Date.now() - startedAt) / 1000, QUEUE_LABELS);
    }
  },
  {
    connection: new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    }),
    concurrency: Number(process.env.RESUME_EMBEDDING_WORKER_CONCURRENCY ?? "4"),
  },
);

worker.on("completed", (job) => {
  console.log(`resume-embedding job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`resume-embedding job failed: ${job?.id}`, err);

  captureApiException(err, {
    route: `queue:${RESUME_EMBEDDING_QUEUE_NAME}`,
    method: "job",
    userId: job?.data?.userId,
  });
});

let shuttingDown = false;

/**
 * Docker sends SIGTERM on every deploy. Without this the process is killed
 * outright and an embedding job dies between writing the embedding and marking
 * the resume as indexed. `worker.close()` without `force` lets whatever is in
 * flight finish first.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`resume-embedding worker received ${signal}, draining`);

  try {
    await worker.close();
    await closeRedis();
    await flushSentry();

    if (telemetryConfig().enabled) {
      const { shutdownTelemetry } = await import("../observability/otel.js");
      await shutdownTelemetry();
    }
  } catch (error) {
    console.error("resume-embedding worker shutdown error", error);
  }

  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.log("Resume embedding worker started");
