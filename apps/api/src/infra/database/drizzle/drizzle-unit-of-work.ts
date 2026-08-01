import { sql } from "drizzle-orm";
import {
  IUnitOfWork,
  TransactionContext,
} from "../../../core/providers/unit-of-work/unit-of-work.js";
import { db } from "./index.js";
import { resolveExecutor } from "./executor.js";

/**
 * Postgres-backed {@link IUnitOfWork}. Uses postgres-js/Drizzle transactions and
 * a per-user transaction-scoped advisory lock to serialize concurrent seeders.
 */
export class DrizzleUnitOfWork implements IUnitOfWork {
  async runInTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => work(tx));
  }

  async lockForUserSeed(
    userId: string,
    tx: TransactionContext,
  ): Promise<void> {
    const executor = resolveExecutor(tx);

    // Transaction-scoped advisory lock keyed to the user. It blocks any other
    // seeder for the same user until this transaction commits/rolls back, then
    // releases automatically — no explicit unlock needed. `hashtext` maps the
    // uuid to the int4 the lock key expects (implicitly widened to bigint).
    await executor.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
    );
  }
}
