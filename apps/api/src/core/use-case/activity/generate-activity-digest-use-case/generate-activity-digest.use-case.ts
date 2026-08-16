import type { AgentDisclosureLevel } from "@repo/schemas";
import type { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import type { PostEntity, PostSource } from "../../../entity/post/post-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { assertPostRespectsDisclosure } from "../../agent-policy/enforce-post-disclosure.js";
import { findDisclosureViolations } from "../../agent-policy/redact-work-disclosure.js";
import { resolveConnectionDisclosure } from "../shared/resolve-connection-disclosure.js";
import { CreatePostUseCase } from "../../posts/create-post-use-case/create-post.use-case.js";
import { BuildCandidateEvidenceUseCase } from "../build-candidate-evidence-use-case/build-candidate-evidence.use-case.js";
import {
  CandidateEvidence,
  EvidenceClaim,
  EvidenceWindow,
  hasPublishableEvidence,
} from "../build-candidate-evidence-use-case/candidate-evidence.js";
import {
  buildDigestKey,
  resolveDigestWindow,
  resolveRecentWindow,
  resolveTrackRecordWindow,
} from "../shared/digest-window.js";
import { renderActivityDigest } from "./render-activity-digest.js";

export interface IGenerateActivityDigestInput {
  connectionId: string;
  /**
   * The window to digest. Supplied by the queue job so a retry covers exactly
   * the same period as the attempt that failed; omitted by a direct caller, in
   * which case it is derived from the connection's `lastDigestAt`.
   */
  window?: EvidenceWindow;
  now?: Date;
}

export type GenerateActivityDigestStatus =
  | "created"
  /** A post for this exact window already exists. The correct outcome of a retry. */
  | "skipped_duplicate"
  /** A silent week is fine. See the comment on the guard. */
  | "skipped_no_activity";

export interface GenerateActivityDigestResult {
  status: GenerateActivityDigestStatus;
  digestKey: string;
  window: EvidenceWindow;
  post: PostEntity | null;
}

/**
 * The engine's payoff: one connection, one window, one evidence-backed post.
 *
 * Guarantees, in the order they are enforced below:
 *
 * 1. IDEMPOTENT. Every digest carries a `digestKey` of
 *    `digest:<connectionId>:<from>:<to>` in its post metadata, and the key is
 *    looked up before anything is written. Running the same window twice — a
 *    BullMQ retry, two sweeps in one hour, a manual re-run — produces one post.
 *    The guarantee lives in the DATABASE and not in the queue: a queue
 *    deduplication window expires, and the instant it does a retry writes a
 *    second post for a week that already has one.
 * 2. SILENT WHEN THERE IS NOTHING TO SAY. No evidence, no post. Not a "no
 *    activity this week" update — that is a profile telling recruiters the user
 *    did nothing, published automatically, forever.
 * 3. DETERMINISTIC. The body comes from a template, not a model.
 * 4. DISCLOSURE-SAFE. The effective level is resolved through the connection
 *    (see `resolvesDisclosureVia`), the template's only outside-sourced text is
 *    filtered against the denylist, and the finished text is then checked with
 *    the same `assertPostRespectsDisclosure` the PAT write path uses. A
 *    violation surviving all of that is a bug in the template, so it throws
 *    loudly rather than publishing.
 * 5. HUMAN-APPROVED. The post is created `pending_review`, which is non-public
 *    everywhere a draft is, and machine-authored posts are content-immutable —
 *    so the human's only options are approve it or delete it, and a recruiter
 *    can trust the text was not polished afterwards.
 */
export class GenerateActivityDigestUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private postsRepository: IPostRepository,
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
    private buildCandidateEvidenceUseCase: BuildCandidateEvidenceUseCase,
    private createPostUseCase: CreatePostUseCase,
  ) {}

  async execute(
    input: IGenerateActivityDigestInput,
  ): Promise<GenerateActivityDigestResult> {
    const now = input.now ?? new Date();

    const connection = await this.gitConnectionRepository.findById(
      input.connectionId,
    );

    if (!connection) {
      throw new ResourceNotFoundError("GitConnection", input.connectionId);
    }

    const window = input.window ?? resolveDigestWindow(connection, now);
    const digestKey = buildDigestKey(connection.id, window);

    // (1) Idempotency, before any work is done.
    const existing = await this.postsRepository.findByDigestKey(
      connection.userId,
      digestKey,
    );

    if (existing) {
      return { status: "skipped_duplicate", digestKey, window, post: existing };
    }

    const period = await this.buildCandidateEvidenceUseCase.execute({
      userId: connection.userId,
      connectionId: connection.id,
      window,
    });

    // (2) Nothing warranted happened. Stamp the connection anyway: the cadence
    // has to advance or every future sweep re-examines the same empty window
    // forever, and the next digest would then cover an ever-growing period.
    if (!hasPublishableEvidence(period)) {
      connection.markDigested(now);
      await this.gitConnectionRepository.update(connection);

      return { status: "skipped_no_activity", digestKey, window, post: null };
    }

    // Three windows, because the claims answer three different questions and a
    // single horizon gets at least two of them wrong. The cadence window says
    // what happened this period; a quarter says whether that was typical ("11
    // of the last 13 weeks" over four years would read "40 of the last 209");
    // and four years carries the tenure claims ("43 of the last 48 months",
    // which a seven-day window could only render as "1 of the last 1"). Each
    // claim's provenance names the window it came from, so the UI can show a
    // reader exactly which horizon produced which number.
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

    const disclosure = await this.resolveDisclosure(connection);

    // (3) + (4)
    const rendered = renderActivityDigest({
      period,
      recent,
      trackRecord,
      blockedTerms: disclosure.blockedTerms,
    });

    const metadata = buildDigestMetadata({
      digestKey,
      connection,
      period,
      recent,
      trackRecord,
      level: disclosure.level,
      blockedTerms: disclosure.blockedTerms,
      generatedAt: now,
    });

    // Checked over the metadata as well as the text: metadata is stored content
    // that is read back, so a claim object carrying an employer's name would be
    // a leak with a perfectly clean-looking body.
    this.assertTemplateIsClean(rendered, metadata, disclosure.blockedTerms);

    assertPostRespectsDisclosure({
      user: disclosure.user,
      workExperiences: disclosure.workExperiences,
      workExperienceId: disclosure.workExperienceId,
      title: rendered.title,
      body: rendered.body,
      tags: rendered.tags,
    });

    // (5) `authType: "pat"` is what lets a non-manual source through
    // `CreatePostUseCase`, and it re-runs the disclosure check there — the same
    // path an MCP agent takes, so a digest cannot be a privileged writer.
    const post = await this.createPostUseCase.execute({
      userId: connection.userId,
      authType: "pat",
      source: resolvePostSource(connection),
      status: "pending_review",
      title: rendered.title,
      body: rendered.body,
      tags: rendered.tags,
      workExperienceId: disclosure.workExperienceId,
      metadata,
    });

    connection.markDigested(now);
    await this.gitConnectionRepository.update(connection);

    return { status: "created", digestKey, window, post };
  }

  /**
   * The level that applies to this connection's activity. Lives in
   * `resolve-connection-disclosure.ts`, shared with the digest preview, so a
   * preview can never disagree with the run it is previewing.
   */
  private async resolveDisclosure(connection: GitConnectionEntity) {
    return resolveConnectionDisclosure(
      connection,
      this.usersRepository,
      this.workExperienceRepository,
    );
  }

  /**
   * The template is supposed to be structurally incapable of naming an
   * employer: it emits numbers, dates and technology tags, and the tags are
   * already filtered. If something got through anyway, the template is broken —
   * so this throws rather than redacting, because silently publishing a
   * half-redacted post would hide the bug behind a plausible-looking update.
   *
   * `assertPostRespectsDisclosure` runs straight after this and would catch most
   * of the same cases; this exists because that helper resolves the level from
   * the account and the role only, and would not see a connection-level override
   * that is STRICTER than either.
   */
  private assertTemplateIsClean(
    rendered: { title: string; body: string; tags: string[] | null },
    metadata: Record<string, unknown>,
    blockedTerms: readonly string[],
  ): void {
    if (blockedTerms.length === 0) return;

    const haystack = [
      rendered.title,
      rendered.body,
      ...(rendered.tags ?? []),
      JSON.stringify(metadata),
    ].join("\n");

    const violations = findDisclosureViolations(haystack, blockedTerms);

    if (violations.length > 0) {
      throw new Error(
        "Deterministic digest template produced text that violates the " +
          `connection's disclosure level: ${violations
            .map((term) => `"${term}"`)
            .join(", ")}. This is a template bug, not user input — the digest ` +
          "renderer must not be able to emit an employer or client name.",
      );
    }
  }
}

/**
 * Where the evidence came from decides the post's provenance label.
 *
 * `commit` for the forges: those events are pull requests, reviews and releases
 * delivered by GitHub/GitLab webhooks, i.e. the commit-derived history the
 * `commit` source already means elsewhere in the product (it is what
 * `create_commit_summary_post` writes).
 *
 * `agent` for `claude_code` and `extractor`: those events come from a coding
 * agent's session hook and a local extractor run, which is agent-sourced
 * activity rather than a forge's record of merged work. Labelling them `commit`
 * would tell a reader a forge vouched for something no forge ever saw.
 */
function resolvePostSource(connection: GitConnectionEntity): PostSource {
  return connection.provider === "github" || connection.provider === "gitlab"
    ? "commit"
    : "agent";
}

/**
 * The provenance facts, stored on the post so the UI can answer "why did I get
 * this number" from the post alone, without re-reading the event log.
 *
 * Note what is here and what is not: counts, windows, sources, kinds and the
 * full claim objects — all of which are numbers and enum values. No repository
 * fingerprint, no counterparty fingerprint, no payload. There is a test
 * asserting no fingerprint from the fixture appears anywhere in the post.
 */
/**
 * Removes technology-density claims whose technology is a blocked term.
 *
 * Post metadata is stored content and is served back to the owner (and to
 * anything the product later builds on top of it), so it is subject to the same
 * disclosure rule as the body. The rendered text already filters blocked tags,
 * but the CLAIM OBJECTS are copied into metadata verbatim, and a tag of "Acme"
 * on an ingested event would otherwise land in `metadata.claims[].technology`
 * with the body looking perfectly clean.
 *
 * Dropped rather than placeholder-redacted: a density claim about `[employer]`
 * carries no information, and leaving the count behind under a masked name
 * invites someone to reverse it from the other claims.
 */
function withoutBlockedTechnologies(
  claims: readonly EvidenceClaim[],
  blockedTerms: readonly string[],
): EvidenceClaim[] {
  if (blockedTerms.length === 0) return [...claims];

  return claims.filter(
    (claim) =>
      claim.kind !== "technology_month_density" ||
      findDisclosureViolations(claim.technology, blockedTerms).length === 0,
  );
}

function buildDigestMetadata(input: {
  digestKey: string;
  connection: GitConnectionEntity;
  period: CandidateEvidence;
  recent: CandidateEvidence;
  trackRecord: CandidateEvidence;
  level: AgentDisclosureLevel;
  blockedTerms: readonly string[];
  generatedAt: Date;
}): Record<string, unknown> {
  return {
    digestKey: input.digestKey,
    connectionId: input.connection.id,
    provider: input.connection.provider,
    connectionKind: input.connection.kind,
    cadence: input.connection.cadence,
    disclosureLevel: input.level,
    // Marks the text as template-rendered. A future LLM-assisted variant must
    // use a different value so a reader can tell the two apart.
    engine: "deterministic-digest-v1",
    generatedAt: input.generatedAt.toISOString(),
    window: input.period.window,
    recentWindow: input.recent.window,
    trackRecordWindow: input.trackRecord.window,
    eventCount: input.period.totalEventCount,
    // Present for the provenance panel, absent from the rendered body. See the
    // claim rationale in `candidate-evidence.ts` for why it is never a headline.
    commitCount: input.period.internalCommitCount,
    claims: withoutBlockedTechnologies(input.period.claims, input.blockedTerms),
    recentClaims: withoutBlockedTechnologies(
      input.recent.claims,
      input.blockedTerms,
    ),
    trackRecordClaims: withoutBlockedTechnologies(
      input.trackRecord.claims,
      input.blockedTerms,
    ),
  };
}
