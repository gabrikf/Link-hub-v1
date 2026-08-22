import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { dailyActiveUsers, queueDepth } from "./metrics.js";
import { telemetryConfig } from "../config/app-config.js";
import { getRedis, isRedisUnavailable } from "../redis/redis-client.js";
import { RESUME_EMBEDDING_QUEUE_NAME } from "../providers/bullmq-resume-embedding-queue.js";
import { ACTIVITY_DIGEST_QUEUE_NAME } from "../providers/bullmq-activity-digest-queue.js";

/**
 * The two gauges that read shared state rather than counting local events.
 *
 * Both are registered ONLY in the api process. The api, worker-embedding and
 * worker-digest containers all share one Redis, so if each reported queue depth
 * we would get three identical series separated only by service.instance.id —
 * triple the series budget for one number, and a dashboard that has to remember
 * to pick one.
 */

const DAU_KEY_PREFIX = "dau";
/** Two days: enough for the exporter to still read yesterday around midnight. */
const DAU_TTL_SECONDS = 60 * 60 * 48;

function todayKey(now: Date = new Date()): string {
  // UTC on purpose — the reset boundary has to match the one the AI quota uses
  // and be stable regardless of where the box is.
  return `${DAU_KEY_PREFIX}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Records one authenticated user into today's HyperLogLog.
 *
 * A HyperLogLog is the whole point: it answers "how many distinct users today"
 * in ~12KB regardless of volume, and — unlike a per-user metric label — costs
 * exactly one time series no matter how many users sign up. The cardinality
 * rule in `metrics.ts` forbids the alternative.
 *
 * Fire-and-forget: counting a visitor must never slow down or fail a request.
 */
export function recordDailyActiveUser(userId: string): void {
  if (isRedisUnavailable()) {
    return;
  }

  const key = todayKey();

  void getRedis()
    .pipeline()
    .pfadd(key, userId)
    .expire(key, DAU_TTL_SECONDS)
    .exec()
    .catch(() => {
      // Redis down: the day's count under-reports. Not worth an error path.
    });
}

let queueReaders: Queue[] | null = null;
let registered = false;

function buildQueueReaders(): Queue[] {
  if (queueReaders) {
    return queueReaders;
  }

  // BullMQ requires `maxRetriesPerRequest: null` on its connections, which is
  // incompatible with the fail-fast shared client, so these read-only Queue
  // handles get their own. Two extra connections, on the api container only,
  // created once for the lifetime of the process.
  const connection = new Redis(
    process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    { maxRetriesPerRequest: null },
  );
  connection.on("error", () => {});

  queueReaders = [
    new Queue(RESUME_EMBEDDING_QUEUE_NAME, { connection }),
    new Queue(ACTIVITY_DIGEST_QUEUE_NAME, { connection }),
  ];

  return queueReaders;
}

/**
 * Attaches the async callbacks. Safe to call unconditionally — it returns
 * immediately unless telemetry is on and this process is the api.
 */
export function registerObservableMetrics(): void {
  const config = telemetryConfig();

  if (!config.enabled || config.role !== "api" || registered) {
    return;
  }

  registered = true;

  dailyActiveUsers.addCallback(async (result) => {
    if (isRedisUnavailable()) {
      return;
    }

    try {
      const count = await getRedis().pfcount(todayKey());
      result.observe(count);
    } catch {
      // Skip this collection interval rather than reporting a bogus zero,
      // which would look like every user vanished.
    }
  });

  queueDepth.addCallback(async (result) => {
    for (const queue of buildQueueReaders()) {
      try {
        const counts = await queue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
        );

        for (const [state, value] of Object.entries(counts)) {
          result.observe(value, { queue: queue.name, state });
        }
      } catch {
        // Same reasoning as above.
      }
    }
  });
}

export async function closeObservableMetrics(): Promise<void> {
  if (!queueReaders) {
    return;
  }

  const readers = queueReaders;
  queueReaders = null;

  await Promise.allSettled(readers.map((queue) => queue.close()));
}
