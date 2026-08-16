import type { GitConnectionHealth } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IActivityEventRepository } from "../../../repositories/activity-event/activity-event-repository.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import { addDays, toDateString } from "../shared/activity-buckets.js";

export interface IGetConnectionHealthInput {
  userId: string;
  connectionId: string;
  /** Injectable clock so the "last 7 / 30 days" windows are testable. */
  now?: Date;
}

/**
 * Live status of one connection: is anything arriving, and when does the next
 * digest run.
 *
 * A read model of counts and dates only — the UI polls this in a loop during
 * the "listening for first activity" setup step, and a read model that is
 * polled must be structurally incapable of echoing a fingerprint back.
 *
 * The windows are inclusive of today: "last 7 days" is today and the six days
 * before it, matching how the digest windows count their days.
 */
export class GetConnectionHealthUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private activityEventRepository: IActivityEventRepository,
  ) {}

  async execute(input: IGetConnectionHealthInput): Promise<GitConnectionHealth> {
    const connection = await this.gitConnectionRepository.findById(
      input.connectionId,
    );

    // Missing and not-yours are the SAME answer on purpose, mirroring the
    // ingestion path: a health endpoint that answered them differently would
    // be an oracle telling any authenticated user which connection ids exist.
    if (!connection || connection.userId !== input.userId) {
      throw new ResourceNotFoundError("GitConnection", input.connectionId);
    }

    const today = toDateString(input.now ?? new Date());

    const aggregates = await this.activityEventRepository.aggregateByConnectionId(
      connection.id,
      {
        recentSince: addDays(today, -6),
        distinctReposSince: addDays(today, -29),
      },
    );

    return {
      connectionId: connection.id,
      totalEvents: aggregates.totalEvents,
      lastEventOn: aggregates.lastEventOn,
      eventsLast7Days: aggregates.recentEventCount,
      distinctReposLast30Days: aggregates.distinctRepoCount,
      lastDigestAt: connection.lastDigestAt,
      nextDigestDueAt: connection.nextDigestDueAt(),
    };
  }
}
