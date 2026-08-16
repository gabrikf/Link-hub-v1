import type { DigestPreview } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { BuildCandidateEvidenceUseCase } from "../build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import { hasPublishableEvidence } from "../build-candidate-evidence-use-case/candidate-evidence.js";
import { renderActivityDigest } from "../generate-activity-digest-use-case/render-activity-digest.js";
import {
  resolveDigestPreviewWindow,
  resolveRecentWindow,
  resolveTrackRecordWindow,
} from "../shared/digest-window.js";
import { resolveConnectionDisclosure } from "../shared/resolve-connection-disclosure.js";

export interface IPreviewActivityDigestInput {
  userId: string;
  connectionId: string;
  now?: Date;
}

/**
 * What the next digest WOULD say, rendered on demand and thrown away.
 *
 * This is the "show me a real post before I enable anything" step of the setup
 * flow, so it must be a pure read: no post, no `digestKey`, no `markDigested`.
 * Anything it persisted would either burn the idempotency key of the real run
 * or advance the cadence of a connection the user was merely inspecting.
 *
 * It reuses the generator's own parts — the evidence builder over the same
 * three windows, the shared disclosure resolution and the deterministic
 * renderer — because a preview that took its own path would eventually show a
 * post the real run does not produce. The one divergence is deliberate: the
 * window is a trailing cadence period ending today (`resolveDigestPreviewWindow`),
 * not the next un-digested window, so the preview describes a typical period
 * rather than whatever stub happens to be pending.
 *
 * The two empty outcomes are distinct on purpose: `no_activity` means nothing
 * has arrived and the user should check the connection, `insufficient_evidence`
 * means events arrived but none clears the publishable-claim bar — the same
 * `hasPublishableEvidence` gate the generator applies, so "the preview is
 * empty" and "the digest would not post" can never disagree.
 */
export class PreviewActivityDigestUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
    private buildCandidateEvidenceUseCase: BuildCandidateEvidenceUseCase,
  ) {}

  async execute(input: IPreviewActivityDigestInput): Promise<DigestPreview> {
    const connection = await this.gitConnectionRepository.findById(
      input.connectionId,
    );

    // Missing and not-yours are the SAME answer, for the same oracle reason as
    // the health endpoint and the ingestion path.
    if (!connection || connection.userId !== input.userId) {
      throw new ResourceNotFoundError("GitConnection", input.connectionId);
    }

    const now = input.now ?? new Date();
    const window = resolveDigestPreviewWindow(connection, now);

    const period = await this.buildCandidateEvidenceUseCase.execute({
      userId: connection.userId,
      connectionId: connection.id,
      window,
    });

    if (period.totalEventCount === 0) {
      return {
        status: "no_activity",
        post: null,
        window,
        eventCount: 0,
      };
    }

    if (!hasPublishableEvidence(period)) {
      return {
        status: "insufficient_evidence",
        post: null,
        window,
        eventCount: period.totalEventCount,
      };
    }

    const recent = await this.buildCandidateEvidenceUseCase.execute({
      userId: connection.userId,
      connectionId: connection.id,
      window: resolveRecentWindow(window),
    });

    const trackRecord = await this.buildCandidateEvidenceUseCase.execute({
      userId: connection.userId,
      connectionId: connection.id,
      window: resolveTrackRecordWindow(window),
    });

    const disclosure = await resolveConnectionDisclosure(
      connection,
      this.usersRepository,
      this.workExperienceRepository,
    );

    // The renderer filters its only outside-sourced text (technology tags)
    // against the same denylist the generator uses. The generator's louder
    // assertions run at publish time on the real post; a preview that somehow
    // rendered a violation would be caught there before anything went public.
    const rendered = renderActivityDigest({
      period,
      recent,
      trackRecord,
      blockedTerms: disclosure.blockedTerms,
    });

    return {
      status: "ready",
      post: {
        title: rendered.title,
        body: rendered.body,
        tags: rendered.tags,
      },
      window,
      eventCount: period.totalEventCount,
    };
  }
}
