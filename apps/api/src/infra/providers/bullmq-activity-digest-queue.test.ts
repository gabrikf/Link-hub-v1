import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ActivityDigestJobPayload } from "../../core/providers/queue/activity-digest-queue.js";
import {
  ACTIVITY_DIGEST_JOB_NAME,
  ACTIVITY_DIGEST_SWEEP_JOB_NAME,
  ACTIVITY_DIGEST_SWEEP_SCHEDULER_ID,
  BullMqActivityDigestQueue,
} from "./bullmq-activity-digest-queue.js";
import { expectDefined } from "../../test-support/expect-defined.js";

/**
 * Pins the two things this queue must not become.
 *
 * The sibling `bullmq-resume-embedding-queue.test.ts` documents a real bug: a
 * `jobId` derived from the payload made the first enqueue for a key the only one
 * that ever ran, silently, for months. The same shape is available here — a
 * digest key looks like a perfect job id — so the first half of this file exists
 * to make that mistake fail loudly.
 *
 * The second half pins the scheduler: `upsertJobScheduler` must be idempotent,
 * because the worker calls it on every boot.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/** Isolated from the real dev queue so a running worker can't eat the jobs. */
const TEST_QUEUE_NAME = `activity-digest-test-${process.pid}`;

const inspector = new Queue(TEST_QUEUE_NAME, {
  connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
});

const queues: BullMqActivityDigestQueue[] = [];

function createQueue(dedupeTtlMs = 10_000) {
  const queue = new BullMqActivityDigestQueue({
    queueName: TEST_QUEUE_NAME,
    dedupeTtlMs,
  });
  queues.push(queue);
  return queue;
}

function payload(digestKey: string): ActivityDigestJobPayload {
  return {
    connectionId: "connection-1",
    userId: "user-1",
    digestKey,
    window: { from: "2026-08-08", to: "2026-08-14" },
    reason: "cadence-sweep",
    triggeredAt: new Date().toISOString(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  await inspector.obliterate({ force: true });
});

afterAll(async () => {
  await inspector.obliterate({ force: true });
  await inspector.close();
  await Promise.all(queues.map((queue) => queue.close()));
});

describe("BullMqActivityDigestQueue — enqueue", () => {
  it("never pins a job to the digest key", async () => {
    await createQueue().enqueue(payload("digest:c1:2026-08-08:2026-08-14"));

    const [queuedJob] = await inspector.getJobs([
      "waiting",
      "delayed",
      "active",
    ]);
    const job = expectDefined(queuedJob, "the enqueued digest job");

    // A job id keyed on the payload is unique for as long as the job record
    // exists, and `removeOnComplete` keeps completed jobs around — so a digest
    // lost to a worker crash could never be re-queued.
    expect(job.id).not.toBe("digest:c1:2026-08-08:2026-08-14");
    expect(job.name).toBe(ACTIVITY_DIGEST_JOB_NAME);
    expect(job.opts.deduplication?.id).toBe("digest:c1:2026-08-08:2026-08-14");
    expect(job.opts.deduplication?.ttl).toBeGreaterThan(0);
  });

  it("runs immediately — the window is closed, so there is nothing to wait for", async () => {
    await createQueue().enqueue(payload("digest:c1:2026-08-08:2026-08-14"));

    // The resume queue delays its job because its dedup window starts at the
    // first `add` and the underlying row is still being edited. A digest window
    // is already closed and is carried on the payload, so delaying would only
    // add latency.
    expect(await inspector.getJobs(["delayed"])).toHaveLength(0);
    expect(await inspector.getJobs(["waiting", "active"])).toHaveLength(1);
  });

  it("collapses two sweeps that queue the same window", async () => {
    const queue = createQueue();

    await queue.enqueue(payload("digest:c1:2026-08-08:2026-08-14"));
    await queue.enqueue(payload("digest:c1:2026-08-08:2026-08-14"));

    expect(
      await inspector.getJobs(["waiting", "delayed", "active"]),
    ).toHaveLength(1);
  });

  it("keeps different windows independent", async () => {
    const queue = createQueue();

    await queue.enqueue(payload("digest:c1:2026-08-08:2026-08-14"));
    await queue.enqueue(payload("digest:c1:2026-08-15:2026-08-21"));

    expect(
      await inspector.getJobs(["waiting", "delayed", "active"]),
    ).toHaveLength(2);
  });

  it("lets the same window be re-queued once the window has closed", async () => {
    const queue = createQueue(50);

    await queue.enqueue(payload("digest:c1:2026-08-08:2026-08-14"));
    await sleep(120);
    await queue.enqueue(payload("digest:c1:2026-08-08:2026-08-14"));

    // The deduplication window is a cost optimisation, not the correctness
    // boundary — exactly-once is the `digestKey` lookup in the posts table — so
    // a second job here is expected and harmless.
    expect(
      await inspector.getJobs(["waiting", "delayed", "active"]),
    ).toHaveLength(2);
  });
});

describe("BullMqActivityDigestQueue — the sweep scheduler", () => {
  it("registers exactly one scheduler however many times it is called", async () => {
    const queue = new BullMqActivityDigestQueue({
      queueName: TEST_QUEUE_NAME,
      sweepPattern: "0 0 1 1 *",
    });
    queues.push(queue);

    // The worker calls this on every boot, and a restart loop must not
    // accumulate schedulers.
    await queue.ensureSweepScheduled();
    await queue.ensureSweepScheduled();
    await queue.ensureSweepScheduled();

    const schedulers = await inspector.getJobSchedulers();

    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]?.key).toBe(ACTIVITY_DIGEST_SWEEP_SCHEDULER_ID);
    expect(schedulers[0]?.name).toBe(ACTIVITY_DIGEST_SWEEP_JOB_NAME);
  });
});
