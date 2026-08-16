export type ActivityDigestJobReason =
  /** Enqueued by the repeatable sweep because the connection's cadence came due. */
  | "cadence-sweep"
  /** Enqueued by a person asking for a digest now. */
  | "manual";

export interface ActivityDigestJobPayload {
  connectionId: string;
  userId: string;
  /**
   * `digest:<connectionId>:<from>:<to>`, computed by the sweep and carried on
   * the job.
   *
   * It is on the payload rather than recomputed in the worker so the queue can
   * deduplicate on it, and so a job that sat in the queue over midnight still
   * digests the window it was created for instead of silently sliding a day.
   */
  digestKey: string;
  /**
   * The exact window this job must digest. Pinned at enqueue time for the same
   * reason: a retry an hour later has to produce the same post, not a different
   * one.
   */
  window: { from: string; to: string };
  reason: ActivityDigestJobReason;
  triggeredAt: string;
}

export interface IActivityDigestQueue {
  /** Queues one connection's digest for one window. */
  enqueue(payload: ActivityDigestJobPayload): Promise<void>;
  /**
   * Registers the repeatable sweep, if it is not registered already.
   *
   * Called by the worker on boot rather than by the API: the sweep is the
   * worker's own heartbeat, and a deployment with no worker running should not
   * be quietly accumulating jobs nobody will process. Must be idempotent —
   * every worker restart calls it.
   */
  ensureSweepScheduled(): Promise<void>;
}
