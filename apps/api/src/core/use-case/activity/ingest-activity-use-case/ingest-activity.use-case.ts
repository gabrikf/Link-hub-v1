import type {
  ActivitySource,
  IngestActivityEventInput,
  IngestActivityResult,
} from "@repo/schemas";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { IActivityEventRepository } from "../../../repositories/activity-event/activity-event-repository.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import {
  counterpartyFingerprintInput,
  repoFingerprintInput,
} from "../shared/repo-fingerprint.js";

export interface IIngestActivityInput {
  userId: string;
  connectionId: string;
  source: ActivitySource;
  events: IngestActivityEventInput[];
}

/** What one event looks like after hashing, i.e. what is allowed to be stored. */
interface FingerprintedEvent {
  externalDeliveryId: string;
  kind: IngestActivityEventInput["kind"];
  occurredOn: string;
  repoFingerprint: string;
  technologies: string[];
  actorIsOwner: boolean;
  counterpartyFingerprints: string[];
  payload: Record<string, unknown> | null;
}

/**
 * Appends a batch of developer activity to the log.
 *
 * Two responsibilities, both of which exist because the callers — a Claude Code
 * hook, a forge webhook relay and a local CLI — are outside CraftHub's control:
 *
 * 1. HASH ON ARRIVAL. A caller may send a repository identifier and reviewer ids
 *    in the clear; they are fingerprinted here and the clear values are dropped
 *    on the floor of this method. Nothing downstream ever sees them, which is
 *    what makes "hashing at ingestion, never at render" true rather than
 *    aspirational.
 * 2. IDEMPOTENCY. `(source, externalDeliveryId)` is unique, so a replayed batch
 *    is absorbed as `duplicates` and reported as a 200 success. A retrying hook
 *    must never be punished with an error it will retry harder.
 */
export class IngestActivityUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private activityEventRepository: IActivityEventRepository,
    /**
     * Reused for its `hash()`: a deterministic hex sha-256, which is exactly
     * what `activityFingerprintSchema` describes. Injected rather than
     * `node:crypto` so core stays free of infra, and shared with the PAT path so
     * there is one hash implementation in the process rather than two that can
     * drift.
     */
    private tokenProvider: ITokenProvider,
  ) {}

  async execute(input: IIngestActivityInput): Promise<IngestActivityResult> {
    const connection = await this.gitConnectionRepository.findById(
      input.connectionId,
    );

    // Missing and not-yours are the SAME answer on purpose. Distinguishing them
    // would turn this endpoint into an oracle that tells any token holder which
    // connection ids exist.
    if (!connection || connection.userId !== input.userId) {
      throw new ForbiddenError("You do not have access to this connection");
    }

    // Every event is fingerprinted and validated BEFORE anything is written, so
    // one malformed event in a batch cannot leave half of it persisted.
    const prepared = input.events.map((event, index) =>
      this.fingerprint(event, index),
    );

    let recorded = 0;
    let duplicates = 0;

    for (const event of prepared) {
      const result = await this.activityEventRepository.create(
        ActivityEventEntity.create({
          userId: connection.userId,
          connectionId: connection.id,
          source: input.source,
          externalDeliveryId: event.externalDeliveryId,
          kind: event.kind,
          occurredOn: event.occurredOn,
          repoFingerprint: event.repoFingerprint,
          technologies: event.technologies,
          actorIsOwner: event.actorIsOwner,
          counterpartyFingerprints: event.counterpartyFingerprints,
          payload: event.payload,
        }),
      );

      if (result.status === "duplicate") {
        duplicates += 1;
      } else {
        recorded += 1;
      }
    }

    return { recorded, duplicates };
  }

  private fingerprint(
    event: IngestActivityEventInput,
    index: number,
  ): FingerprintedEvent {
    return {
      externalDeliveryId: event.externalDeliveryId,
      kind: event.kind,
      occurredOn: event.occurredOn,
      repoFingerprint: this.resolveRepoFingerprint(event, index),
      technologies: event.technologies ?? [],
      actorIsOwner: event.actorIsOwner ?? true,
      counterpartyFingerprints: this.resolveCounterpartyFingerprints(
        event,
        index,
      ),
      payload: event.payload ?? null,
    };
  }

  private resolveRepoFingerprint(
    event: IngestActivityEventInput,
    index: number,
  ): string {
    const hashedFromClear =
      event.repo === undefined
        ? undefined
        : this.hash(repoFingerprintInput(event.repo));

    if (hashedFromClear !== undefined && event.repoFingerprint !== undefined) {
      // Both forms sent: they must agree, or one of them is a lie about which
      // repository this event belongs to and there is no safe way to pick.
      if (hashedFromClear !== event.repoFingerprint) {
        throw new BadRequestError(
          `events[${index}]: repo and repoFingerprint disagree`,
        );
      }

      return event.repoFingerprint;
    }

    const fingerprint = hashedFromClear ?? event.repoFingerprint;

    // `activity_events.repo_fingerprint` is NOT NULL, and an event with no
    // repository identity cannot be aggregated per-repo later. Rejecting here
    // beats inventing a placeholder that silently merges unrelated repos.
    if (fingerprint === undefined) {
      throw new BadRequestError(
        `events[${index}]: one of repo or repoFingerprint is required`,
      );
    }

    return fingerprint;
  }

  private resolveCounterpartyFingerprints(
    event: IngestActivityEventInput,
    index: number,
  ): string[] {
    const hashedFromClear = event.counterparties?.map((value) =>
      this.hash(counterpartyFingerprintInput(value)),
    );

    if (hashedFromClear !== undefined && event.counterpartyFingerprints) {
      if (!sameSet(hashedFromClear, event.counterpartyFingerprints)) {
        throw new BadRequestError(
          `events[${index}]: counterparties and counterpartyFingerprints disagree`,
        );
      }

      return distinct(event.counterpartyFingerprints);
    }

    // Unlike the repo, "neither" is legitimate here: most events have nobody on
    // the other side, and the column defaults to an empty array.
    return distinct(hashedFromClear ?? event.counterpartyFingerprints ?? []);
  }

  /**
   * The input is always one of the prefixed forms from `repo-fingerprint.ts`,
   * which reproduces the extractor's normalization byte for byte. That parity
   * is the contract: the extractor fingerprints locally, and if the API hashed
   * a clear identity any other way, the same repo reported via webhook (clear)
   * and via extractor (pre-hashed) would carry two fingerprints and be counted
   * twice by every per-repo aggregate.
   */
  private hash(value: string): string {
    return this.tokenProvider.hash(value);
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/** Order-insensitive: neither caller promises a stable ordering of ids. */
function sameSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();

  return a.length === b.length && a.every((value, i) => value === b[i]);
}
