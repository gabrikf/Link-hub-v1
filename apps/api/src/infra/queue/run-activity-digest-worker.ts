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
 * One queue, two job names.
 *
 * The sweep and the per-connection digests share a queue so a single worker
 * process (and a single Redis connection) serves both, and so the fan-out is
 * visible in one place when something is stuck.
 */
const worker = new Worker<ActivityDigestJobPayload>(
  ACTIVITY_DIGEST_QUEUE_NAME,
  async (job) => {
    if (job.name === ACTIVITY_DIGEST_SWEEP_JOB_NAME) {
      const sweepUseCase = resolve<SweepDueActivityDigestsUseCase>(
        TOKENS.SweepDueActivityDigestsUseCase,
      );

      const result = await sweepUseCase.execute({});

      console.log(
        `activity-digest sweep: considered ${result.considered}, enqueued ${result.enqueued}`,
      );
      return;
    }

    if (job.name === ACTIVITY_DIGEST_JOB_NAME) {
      const generateUseCase = resolve<GenerateActivityDigestUseCase>(
        TOKENS.GenerateActivityDigestUseCase,
      );

      const result = await generateUseCase.execute({
        connectionId: job.data.connectionId,
        window: job.data.window,
      });

      console.log(
        `activity-digest ${job.data.digestKey}: ${result.status}`,
      );
      return;
    }

    // A job name this worker does not know is a deploy skew, not a data error.
    // Throwing sends it to `failed` where it is visible, rather than being
    // silently acknowledged and lost.
    throw new Error(`Unknown activity-digest job name: ${job.name}`);
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
});

console.log("Activity digest worker started");
