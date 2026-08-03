import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ResumeEmbeddingJobPayload } from "../../core/providers/queue/resume-embedding-queue.js";
import {
  BullMqResumeEmbeddingQueue,
  RESUME_EMBEDDING_DEBOUNCE_MS,
} from "./bullmq-resume-embedding-queue.js";

/**
 * Regression cover for a silent data-staleness bug.
 *
 * The queue used to pass `jobId: payload.resumeId`. A BullMQ job id is unique
 * for as long as the job record exists, and `removeOnComplete: 1000` keeps the
 * last thousand completed jobs around — so the first enqueue for a resume was
 * the only one that ever ran. Every subsequent re-embed (a work experience
 * edited, a skill added, an AI import applied) was accepted by the API and then
 * dropped on the floor, leaving the search vector frozen at its first value.
 *
 * Nothing threw, so nothing caught it. These tests pin the two halves of the
 * intended behaviour: a burst collapses, and the window closes.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/** Isolated from the real dev queue so a running worker can't eat the jobs. */
const TEST_QUEUE_NAME = `resume-embedding-test-${process.pid}`;

const inspector = new Queue(TEST_QUEUE_NAME, {
  connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
});

const queues: BullMqResumeEmbeddingQueue[] = [];

function createQueue(debounceMs: number) {
  const queue = new BullMqResumeEmbeddingQueue({
    queueName: TEST_QUEUE_NAME,
    debounceMs,
  });
  queues.push(queue);
  return queue;
}

function payload(resumeId: string): ResumeEmbeddingJobPayload {
  return {
    resumeId,
    userId: "user-1",
    reason: "work-experience-changed",
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

describe("BullMqResumeEmbeddingQueue", () => {
  it("re-enqueues a resume once the deduplication window has closed", async () => {
    const queue = createQueue(50);

    await queue.enqueue(payload("resume-1"));
    await sleep(120);
    await queue.enqueue(payload("resume-1"));

    // The whole point: the second change to the same resume must produce its
    // own job. Under the old `jobId: resumeId` behaviour this stayed at 1
    // forever, and the candidate's embedding never reflected the change.
    const jobs = await inspector.getJobs(["waiting", "delayed", "active"]);
    expect(jobs).toHaveLength(2);
  });

  it("collapses a burst of enqueues for the same resume into one job", async () => {
    const queue = createQueue(10_000);

    await queue.enqueue(payload("resume-2"));
    await queue.enqueue(payload("resume-2"));
    await queue.enqueue(payload("resume-2"));

    const jobs = await inspector.getJobs(["waiting", "delayed", "active"]);
    expect(jobs).toHaveLength(1);
  });

  it("holds the collapsed job back until the window has closed", async () => {
    const queue = createQueue(10_000);

    await queue.enqueue(payload("resume-debounce"));

    // THE regression this file exists for, and the half the original tests
    // missed. They proved a burst collapses and that the window eventually
    // reopens — but not that the surviving job runs *after* the burst.
    //
    // Without a delay the job ran within milliseconds of the first enqueue, so
    // the real save flow (`PUT /me/resume`, then `PUT /resume/skills/bulk`,
    // then `PUT /resume/titles/bulk`) embedded the resume before its skills
    // existed and then discarded both follow-up enqueues as duplicates. The
    // candidate's vector permanently omitted the weight-4 skill lines.
    //
    // `delayed` (not `waiting`) is the assertion: the job is parked until the
    // window closes, by which time every write in the session has landed and
    // the job re-reads the finished resume.
    const delayed = await inspector.getJobs(["delayed"]);
    expect(delayed).toHaveLength(1);
    expect(delayed[0]?.opts.delay).toBe(10_000);

    const waitingOrActive = await inspector.getJobs(["waiting", "active"]);
    expect(waitingOrActive).toHaveLength(0);
  });

  it("still processes an edit made inside the window", async () => {
    // End-to-end shape of the bug: three writes in one edit session must leave
    // exactly one job, and that job must not have run before the last write.
    const queue = createQueue(200);

    await queue.enqueue(payload("resume-session"));
    await queue.enqueue(payload("resume-session"));
    await queue.enqueue(payload("resume-session"));

    expect(await inspector.getJobs(["waiting", "active"])).toHaveLength(0);

    await sleep(320);

    const promotable = await inspector.getJobs(["waiting", "delayed", "active"]);
    expect(promotable).toHaveLength(1);
  });

  it("keeps different resumes independent", async () => {
    const queue = createQueue(10_000);

    await queue.enqueue(payload("resume-3"));
    await queue.enqueue(payload("resume-4"));

    const jobs = await inspector.getJobs(["waiting", "delayed", "active"]);
    expect(jobs).toHaveLength(2);
  });

  it("never pins a job to the resume id, and bounds the dedup window", async () => {
    const queue = createQueue(RESUME_EMBEDDING_DEBOUNCE_MS);

    await queue.enqueue(payload("resume-5"));

    const [job] = await inspector.getJobs(["waiting", "delayed", "active"]);

    // A job id derived from the resume is the bug. BullMQ assigns its own
    // monotonic id when none is supplied.
    expect(job.id).not.toBe("resume-5");
    expect(job.opts.deduplication?.id).toBe("resume-5");

    // A long TTL would reintroduce the same staleness in slow motion.
    expect(job.opts.deduplication?.ttl).toBeGreaterThan(0);
    expect(job.opts.deduplication?.ttl).toBeLessThanOrEqual(5 * 60_000);
  });
});
