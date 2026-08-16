import { IActivityDigestQueue } from "../../../providers/queue/activity-digest-queue.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import {
  buildDigestKey,
  resolveDigestWindow,
} from "../shared/digest-window.js";

export interface ISweepDueActivityDigestsInput {
  now?: Date;
}

export interface SweepDueActivityDigestsResult {
  /** Connections examined, i.e. every connection allowed to publish. */
  considered: number;
  /** Connections whose cadence had come due, and which now have a job. */
  enqueued: number;
}

/**
 * Finds the connections whose digest cadence has come due and queues one job
 * each.
 *
 * The cadence decision is `GitConnectionEntity.isDueForDigest(now)` and nothing
 * else. It already answers `off` (never due) and never-digested (due
 * immediately), and re-deriving those rules here — in SQL, or as an extra
 * condition — is how the worker and the settings screen start telling a user
 * two different things about when their next post lands.
 *
 * `autoPostEnabled` is the separate switch: the repository filters on it, and
 * the entity deliberately does not, so a user who pauses auto-posting and
 * resumes it later gets their configured schedule back rather than a catch-up
 * burst of every window they missed.
 */
export class SweepDueActivityDigestsUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private activityDigestQueue: IActivityDigestQueue,
  ) {}

  async execute(
    input: ISweepDueActivityDigestsInput = {},
  ): Promise<SweepDueActivityDigestsResult> {
    const now = input.now ?? new Date();
    const triggeredAt = now.toISOString();

    const connections =
      await this.gitConnectionRepository.listAutoPostEnabled();

    let enqueued = 0;

    for (const connection of connections) {
      // Re-checked rather than trusted. `listAutoPostEnabled` is implemented
      // twice — a WHERE clause and an array filter — and the one thing that
      // must never happen is a digest published by a connection whose owner
      // turned auto-posting off.
      if (!connection.autoPostEnabled) continue;

      if (!connection.isDueForDigest(now)) continue;

      const window = resolveDigestWindow(connection, now);

      await this.activityDigestQueue.enqueue({
        connectionId: connection.id,
        userId: connection.userId,
        digestKey: buildDigestKey(connection.id, window),
        window,
        reason: "cadence-sweep",
        triggeredAt,
      });

      enqueued += 1;
    }

    return { considered: connections.length, enqueued };
  }
}
