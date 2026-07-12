/**
 * Opaque handle to an in-flight database transaction. The core layer treats it
 * as a black box; only the infra (Drizzle) layer knows its real shape. Use-cases
 * obtain one from {@link IUnitOfWork.runInTransaction} and thread it through the
 * repository calls that make up a single logical operation, so a multi-row write
 * (e.g. mirroring a tab/block across both viewports) commits all-or-nothing.
 */
export type TransactionContext = unknown;

export interface IUnitOfWork {
  /**
   * Run `work` inside a single database transaction. Every repository call that
   * receives the provided `tx` participates in the same transaction, so the
   * whole unit commits together or rolls back together on error.
   */
  runInTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T>;

  /**
   * Serialize concurrent first-access seeders for a single user. Must be called
   * INSIDE {@link runInTransaction}; the underlying advisory lock is released
   * automatically when that transaction ends. This makes default-layout seeding
   * race-safe: only one concurrent seeder proceeds while the rest block, then
   * re-check and find the seeded rows. A no-op for backends without real
   * concurrency (the in-memory test double).
   */
  lockForUserSeed(
    userId: string,
    tx: TransactionContext,
  ): Promise<void>;
}
