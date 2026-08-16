import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  ActivityDigestJobPayload,
  IActivityDigestQueue,
} from "../../core/providers/queue/activity-digest-queue.js";

export const ACTIVITY_DIGEST_QUEUE_NAME = "activity-digest";

/** The repeatable job that looks for connections whose cadence came due. */
export const ACTIVITY_DIGEST_SWEEP_JOB_NAME = "sweep-due-digests";

/** The per-connection job the sweep fans out to. */
export const ACTIVITY_DIGEST_JOB_NAME = "generate-activity-digest";

/**
 * Stable id of the job scheduler.
 *
 * `upsertJobScheduler` keys on this, so calling it again with the same id
 * REPLACES the schedule instead of adding a second one. That is what makes
 * `ensureSweepScheduled()` safe to run on every worker boot, and what lets the
 * cron pattern be changed by a deploy rather than by manually removing the old
 * entry from Redis.
 */
export const ACTIVITY_DIGEST_SWEEP_SCHEDULER_ID = "activity-digest-sweep";

/**
 * Hourly, on the hour.
 *
 * The cadences this serves are daily, weekly and monthly, so the sweep only has
 * to be finer-grained than a day. Hourly bounds the worst-case latency of "my
 * digest was due" to an hour while keeping the sweep cheap — it is one indexed
 * query over connections with auto-posting on.
 */
export const ACTIVITY_DIGEST_SWEEP_PATTERN = "0 * * * *";

/**
 * How long an enqueue for the same digest key collapses.
 *
 * Matched to the sweep interval so two sweeps cannot both queue the same
 * window, and no longer — see the long note on `enqueue` for why a long window
 * here would be a bug rather than an optimisation.
 */
export const ACTIVITY_DIGEST_DEDUPE_TTL_MS = 60 * 60_000;

function createConnection() {
  return new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });
}

export interface BullMqActivityDigestQueueOptions {
  /** Overridable so a test can drive an isolated queue. */
  queueName?: string;
  /** Overridable so a test can watch the window open and close. */
  dedupeTtlMs?: number;
  /** Overridable so a test does not have to wait an hour for a sweep. */
  sweepPattern?: string;
}

export class BullMqActivityDigestQueue implements IActivityDigestQueue {
  private readonly queue: Queue<ActivityDigestJobPayload>;
  private readonly dedupeTtlMs: number;
  private readonly sweepPattern: string;

  constructor(options: BullMqActivityDigestQueueOptions = {}) {
    this.queue = new Queue<ActivityDigestJobPayload>(
      options.queueName ?? ACTIVITY_DIGEST_QUEUE_NAME,
      { connection: createConnection() },
    );
    this.dedupeTtlMs = options.dedupeTtlMs ?? ACTIVITY_DIGEST_DEDUPE_TTL_MS;
    this.sweepPattern = options.sweepPattern ?? ACTIVITY_DIGEST_SWEEP_PATTERN;
  }

  /**
   * ONE repeatable sweep for the whole installation, not one scheduler per
   * connection.
   *
   * Per-connection schedulers would put the cadence in two places at once —
   * Redis and `git_connections.cadence` — and every settings change would then
   * need a matching `upsertJobScheduler`/`removeJobScheduler`, with a deleted
   * connection leaving a scheduler behind that fires forever. A single sweep
   * reads the cadence from the database every hour, so the database stays the
   * only source of truth and Redis holds exactly one key that can go stale.
   */
  async ensureSweepScheduled(): Promise<void> {
    // `upsertJobScheduler` is the v5 API and the only one that survives into
    // v6: the `repeat` option, `getRepeatableJobs` and `removeRepeatable` are
    // deprecated in 5.x and removed in 6.
    await this.queue.upsertJobScheduler(
      ACTIVITY_DIGEST_SWEEP_SCHEDULER_ID,
      { pattern: this.sweepPattern },
      {
        name: ACTIVITY_DIGEST_SWEEP_JOB_NAME,
        opts: {
          // `JobSchedulerTemplateOptions` deliberately EXCLUDES `jobId`,
          // `repeat`, `delay` and `deduplication` — a scheduler already owns
          // job identity and timing. That is another reason the debounce trick
          // the resume queue uses cannot live at this level, and why the digest
          // deduplicates at the enqueue site and, decisively, in the database.
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
  }

  /**
   * Note on what is deliberately NOT used here: `jobId`.
   *
   * `jobId: digestKey` looks perfect — one job per connection per window — and
   * it is the same trap `bullmq-resume-embedding-queue.ts` documents. A BullMQ
   * job id is unique for as long as the job RECORD exists, and `removeOnComplete`
   * keeps the last N completed jobs, so the first enqueue for a key would be the
   * only one that ever ran and a job lost to a worker crash could never be
   * re-queued. `deduplication` is the option that expresses "collapse a burst",
   * and unlike a job id it expires.
   *
   * The other half of that file's lesson is the reason there is NO `delay` here.
   * The resume queue needed one because its deduplication TTL starts at the
   * first `add`, so an undelayed job read a half-saved resume and every later
   * enqueue was swallowed. A digest cannot have that bug: its window is closed
   * and immutable by the time the sweep runs, and the job carries the window on
   * its payload rather than deriving it at execution time — so running the job
   * immediately and running it an hour later produce the same post.
   *
   * And the deduplication window here is only a COST optimisation, never the
   * correctness boundary. If it expires, or Redis is flushed, or two workers
   * race, the worst case is a duplicate job — which `GenerateActivityDigestUseCase`
   * turns into a no-op by looking the `digestKey` up in the posts table first.
   * "Exactly one post per window" is a database guarantee; the queue is just
   * saving the work.
   */
  async enqueue(payload: ActivityDigestJobPayload): Promise<void> {
    await this.queue.add(ACTIVITY_DIGEST_JOB_NAME, payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 30_000,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
      deduplication: {
        id: payload.digestKey,
        ttl: this.dedupeTtlMs,
      },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
