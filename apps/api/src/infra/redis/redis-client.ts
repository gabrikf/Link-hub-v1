import { Redis } from "ioredis";

/**
 * One shared Redis connection for the request-path features added by the
 * hardening pass: the rate-limit store, the per-user AI quota counters and the
 * daily-active-user HyperLogLog.
 *
 * SCOPE NOTE — this deliberately does NOT take over the connections owned by
 * BullMQ. `bullmq-resume-embedding-queue.ts`, `bullmq-activity-digest-queue.ts`
 * and both worker entrypoints keep building their own client, because BullMQ
 * needs `maxRetriesPerRequest: null` and a Worker holds a *blocking* connection
 * it cannot share. Folding those into this client would change queue semantics
 * for no benefit. The real defect there was the queue provider being registered
 * transiently in the DI container (a new socket on every `resolve()`), and that
 * is fixed at the registration site instead.
 */

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

let client: Redis | null = null;
let unavailable = false;

/**
 * True when REDIS_URL was set explicitly. The queues default to localhost so a
 * developer never has to configure it, but features that would silently do
 * nothing without a real Redis (quota, DAU) use this to decide whether they can
 * be trusted to enforce anything.
 */
export function isRedisConfigured(): boolean {
  const raw = process.env.REDIS_URL;
  return raw !== undefined && raw.trim().length > 0;
}

export function getRedis(): Redis {
  if (client) {
    return client;
  }

  client = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
    /**
     * `maxRetriesPerRequest` bounds how long a command can hang before it
     * rejects, so callers can degrade rather than block a request forever.
     *
     * The offline queue stays ENABLED (ioredis's default). It was briefly set
     * to `false` on the theory that failing fast beats an unbounded backlog,
     * and that was wrong in a way only an integration test caught: ioredis
     * connects asynchronously, so every command issued between process start
     * and the socket becoming writable rejected with "Stream isn't writeable".
     * The rate limiter runs on the very first request, which meant `/auth/login`
     * returned 500 for the whole startup window. Queueing until connected is
     * exactly the behaviour we want; `maxRetriesPerRequest` is what bounds it.
     */
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
  });

  // Without a listener ioredis emits an unhandled 'error' event, which crashes
  // the process the moment Redis blips. Losing Redis must degrade features, not
  // take down the API.
  client.on("error", () => {
    unavailable = true;
  });

  client.on("ready", () => {
    unavailable = false;
  });

  return client;
}

/** Last known socket state. Used to skip work rather than to gate correctness. */
export function isRedisUnavailable(): boolean {
  return unavailable;
}

export async function closeRedis(): Promise<void> {
  if (!client) {
    return;
  }

  const current = client;
  client = null;

  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
