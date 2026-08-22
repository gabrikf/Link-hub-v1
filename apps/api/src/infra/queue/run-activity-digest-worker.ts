import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { setupContainer, TOKENS, resolve } from "../di/container.js";
import {
  ActivityDigestJobPayload,
  IActivityDigestQueue,
} from "../../core/providers/queue/activity-digest-queue.js";
import { GenerateActivityDigestUseCase } from "../../core/use-case/activity/generate-activity-digest-use-case/generate-activity-digest.use-case.js";
import { SweepDueActivityDigestsUseCase } from "../../core/use-case/activity/sweep-due-activity-digests-use-case/sweep-due-activity-digests.use-case.js";
import {
  ACTIVITY_DIGEST_JOB_NAME,
  ACTIVITY_DIGEST_QUEUE_NAME,
  ACTIVITY_DIGEST_SWEEP_JOB_NAME,
} from "../providers/bullmq-activity-digest-queue.js";
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
 * Registering the sweep here, on the worker, is deliberate: the sweep is this
 * process's own heartbeat. An API deployment with no worker running should not
 * be quietly filling Redis with digest jobs nobody will process.
 *
 * `upsertJobScheduler` keys on a stable id, so restarting the worker replaces
 * the schedule rather than adding a second one.
 */
await resolve<IActivityDigestQueue>(
  TOKENS.ActivityDigestQueue,
).ensureSweepScheduled();

/**
 * Queue name only. The sweep and the per-connection digests share these series
 * on purpose — splitting by job name would double the count for a signal both
 * halves answer identically ("is this worker keeping up"), and connection or
 * user ids are forbidden as labels outright.
 */
const QUEUE_LABELS = { queue: ACTIVITY_DIGEST_QUEUE_NAME };

/**
 * One queue, two job names.
 *
 * The sweep and the per-connection digests share a queue so a single worker
 * process (and a single Redis connection) serves both, and so the fan-out is
 * visible in one place when something is stuck.
 */
const worker = new Worker<ActivityDigestJobPayload>(
  ACTIVITY_DIGEST_QUEUE_NAME,
  async (job) => {
    const startedAt = Date.now();

    // How long the job waited before a worker picked it up — the signal that
    // says "add concurrency", which the processing duration cannot show.
    if (job.processedOn) {
      queueJobWaitDuration.record(
        (job.processedOn - job.timestamp) / 1000,
        QUEUE_LABELS,
      );
    }

    try {
      if (job.name === ACTIVITY_DIGEST_SWEEP_JOB_NAME) {
        const sweepUseCase = resolve<SweepDueActivityDigestsUseCase>(
          TOKENS.SweepDueActivityDigestsUseCase,
        );

        const result = await sweepUseCase.execute({});

        console.log(
          `activity-digest sweep: considered ${result.considered}, enqueued ${result.enqueued}`,
        );
      } else if (job.name === ACTIVITY_DIGEST_JOB_NAME) {
        const generateUseCase = resolve<GenerateActivityDigestUseCase>(
          TOKENS.GenerateActivityDigestUseCase,
        );

        const result = await generateUseCase.execute({
          connectionId: job.data.connectionId,
          window: job.data.window,
        });

        console.log(`activity-digest ${job.data.digestKey}: ${result.status}`);
      } else {
        // A job name this worker does not know is a deploy skew, not a data
        // error. Throwing sends it to `failed` where it is visible, rather than
        // being silently acknowledged and lost.
        throw new Error(`Unknown activity-digest job name: ${job.name}`);
      }

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
    concurrency: Number(process.env.ACTIVITY_DIGEST_WORKER_CONCURRENCY ?? "4"),
  },
);

worker.on("failed", (job, err) => {
  console.error(`activity-digest job failed: ${job?.id}`, err);

  captureApiException(err, {
    route: `queue:${ACTIVITY_DIGEST_QUEUE_NAME}`,
    method: "job",
    userId: job?.data?.userId,
  });
});

let shuttingDown = false;

/**
 * Docker sends SIGTERM on every deploy. `worker.close()` without `force` lets
 * the in-flight digest finish, so a redeploy cannot leave a connection marked
 * as digested for a window whose post was never written.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`activity-digest worker received ${signal}, draining`);

  try {
    await worker.close();
    await closeRedis();
    await flushSentry();

    if (telemetryConfig().enabled) {
      const { shutdownTelemetry } = await import("../observability/otel.js");
      await shutdownTelemetry();
    }
  } catch (error) {
    console.error("activity-digest worker shutdown error", error);
  }

  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.log("Activity digest worker started");
