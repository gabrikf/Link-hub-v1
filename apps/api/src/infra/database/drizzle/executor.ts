import { db } from "./index.js";

/**
 * Either the root db handle or an in-flight transaction handle — both expose the
 * same query-builder surface (`select`/`insert`/`update`/`delete`/`execute`).
 */
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the executor a repository method should run against: the caller's
 * transaction context when one was threaded through, otherwise the root db
 * handle (its own implicit transaction). The core passes the context as an
 * opaque `unknown`; this is the single place it is narrowed back to Drizzle's
 * type.
 */
export function resolveExecutor(tx?: unknown): DbExecutor {
  return (tx as DbExecutor | undefined) ?? db;
}
