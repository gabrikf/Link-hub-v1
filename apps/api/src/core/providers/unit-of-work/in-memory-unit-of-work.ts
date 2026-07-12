import {
  IUnitOfWork,
  TransactionContext,
} from "./unit-of-work.js";

/**
 * Test double for {@link IUnitOfWork}. There is no real concurrency or rollback
 * in the in-memory repositories, so the "transaction" simply runs the work
 * synchronously with an undefined context and the seed lock is a no-op.
 */
export class InMemoryUnitOfWork implements IUnitOfWork {
  async runInTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return work(undefined);
  }

  async lockForUserSeed(): Promise<void> {
    // No-op: the in-memory repositories are single-threaded.
  }
}
