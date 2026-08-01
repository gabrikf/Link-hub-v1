import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * Recruiter search holds one connection for four round trips inside a single
 * transaction (the transaction is required — `SET LOCAL ivfflat.probes` only
 * survives inside one). With postgres.js's default `max: 10` that means ten
 * concurrent searches own the whole pool and the eleventh request queues. Worse,
 * postgres.js waits on a free connection with no deadline by default, so that
 * eleventh request hangs rather than failing.
 */
const client = postgres(process.env.DATABASE_URL, {
  max: Number(process.env.DATABASE_POOL_MAX ?? "20"),
  /** Hand idle connections back to Postgres instead of holding them forever. */
  idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT_SECONDS ?? "30"),
  /** Fail fast when Postgres is unreachable rather than hanging the request. */
  connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS ?? "10"),
  /** Recycle connections so a long-lived pod can't accumulate stale sessions. */
  max_lifetime: Number(process.env.DATABASE_MAX_LIFETIME_SECONDS ?? "1800"),
});

export const db = drizzle(client, { schema });
