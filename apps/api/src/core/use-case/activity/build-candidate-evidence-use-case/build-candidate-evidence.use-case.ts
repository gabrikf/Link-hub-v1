import { IActivityEventRepository } from "../../../repositories/activity-event/activity-event-repository.js";
import {
  CandidateEvidence,
  deriveCandidateEvidence,
  EvidenceWindow,
} from "./candidate-evidence.js";

export interface IBuildCandidateEvidenceInput {
  /** Required: evidence is always scoped to one person. */
  userId: string;
  /**
   * Narrows to one connection. A digest is per-connection because disclosure is
   * per-connection — mixing a work connection's events into a personal digest
   * would apply the wrong redaction rules to half the numbers. Omit it to build
   * evidence across everything the user has connected (the profile-wide view).
   */
  connectionId?: string;
  window: EvidenceWindow;
}

/**
 * Turns the activity log into evidence claims.
 *
 * The use case is a thin shell on purpose: it does the one impure thing (read
 * the events) and hands off to `deriveCandidateEvidence`, which is a pure
 * function of `(events, window)`. That split is what makes the interesting part
 * — the claim shapes, the de-duplication, the density fractions — testable
 * against hand-built fixtures with no repository, no clock and no I/O, and it
 * means the same events always produce the same claims.
 *
 * There is no LLM anywhere in this path and there must never be one. A model in
 * the derivation would make the numbers non-reproducible, which is the same as
 * making them unverifiable, which is the same as not having them.
 */
export class BuildCandidateEvidenceUseCase {
  constructor(private activityEventRepository: IActivityEventRepository) {}

  async execute(
    input: IBuildCandidateEvidenceInput,
  ): Promise<CandidateEvidence> {
    // An inverted window is not an error — it is what a freshly-digested
    // connection produces before any new day has passed — so it resolves to
    // "no events", and the caller decides that means "post nothing".
    if (input.window.from > input.window.to) {
      return deriveCandidateEvidence([], input.window);
    }

    const events = input.connectionId
      ? await this.activityEventRepository.listByConnectionId(
          input.connectionId,
          input.window,
        )
      : await this.activityEventRepository.listByUserId(
          input.userId,
          input.window,
        );

    // Belt and braces on the connection path: `listByConnectionId` does not
    // take a user id, so this is the only place that can guarantee a digest is
    // built from its own owner's events.
    const owned = events.filter((event) => event.userId === input.userId);

    return deriveCandidateEvidence(owned, input.window);
  }
}
