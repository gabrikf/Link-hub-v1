import type {
  PostSource,
  PostStatus,
} from "../../../entity/post/post-entity.js";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";

/**
 * Which statuses a post may move to, keyed by the status it is in today.
 *
 * Every status maps to itself so a patch that re-sends the current status is a
 * no-op rather than an error — a client PATCHing a whole form back is normal.
 *
 * The two deliberate omissions are what make the guarantee hold:
 *
 * - `published -> draft` / `published -> pending_review` would let an author
 *   quietly pull a post out of public view, edit it, and put it back. Taking a
 *   post down is `DELETE`, which is visible and irreversible.
 * - `draft -> pending_review` is meaningless: review is what software asks a
 *   human for, not what a human asks themselves. A draft goes straight to
 *   `published`.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ["draft", "published"],
  pending_review: ["pending_review", "published"],
  published: ["published"],
};

/**
 * The fields a machine-authored post refuses to change. Everything the post
 * actually *says* is in here; only `status` and `externalUrl` are left out.
 * `status` is what makes a `pending_review` post reviewable (approve or
 * delete) but not editable.
 *
 * `externalUrl` is out because the link is not part of what the software said
 * — it points AT the work (the PR, the release, the demo) rather than making a
 * claim about it, and the owner often only has the public URL after the digest
 * was generated. So the OWNER, in a real session, may attach one afterwards.
 * Software may not: see `PAT_IMMUTABLE_FIELDS`.
 *
 * `source` stays on the list as a second line of defence. No update path can
 * carry it any more — it is absent from `updatePostSchemaInput`,
 * `IUpdatePostInput` and `PostEntity.updateContent`, because provenance is
 * write-once — but this helper takes an arbitrary patch bag, and a future
 * caller that reintroduces the field would otherwise get a one-request
 * laundering of a machine post to `source: "manual"` for free.
 */
export const MACHINE_AUTHORED_IMMUTABLE_FIELDS = [
  "source",
  "title",
  "body",
  "tags",
  "images",
  "coverImageUrl",
  "metadata",
  "workExperienceId",
] as const;

/**
 * Additionally immutable when the caller authenticated with a PAT.
 *
 * The owner's exemption for `externalUrl` must not extend to software: an
 * agent that can attach a link to a frozen post can retarget what the
 * immutable text appears to vouch for — "approved by 3 reviewers" suddenly
 * pointing at a repository no reviewer ever saw. The human decides where a
 * machine post links, exactly as the human decides whether it publishes.
 */
const PAT_IMMUTABLE_FIELDS = ["externalUrl"] as const;

type MachineAuthoredImmutableField =
  | (typeof MACHINE_AUTHORED_IMMUTABLE_FIELDS)[number]
  | (typeof PAT_IMMUTABLE_FIELDS)[number];

/**
 * Rejects a status change the domain does not allow.
 *
 * A refusal here is `BadRequestError` (not `ForbiddenError`): the caller owns
 * the post and is allowed to change its status in general — this particular
 * move is just not a legal one.
 */
export function assertPostStatusTransition(
  from: PostStatus,
  to: PostStatus,
): void {
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(to)) {
    throw new BadRequestError(
      `A post cannot move from status '${from}' to '${to}'. ` +
        `Allowed from '${from}': ${ALLOWED_STATUS_TRANSITIONS[from].join(", ")}. ` +
        "A published post can only be deleted, never unpublished or re-edited.",
    );
  }
}

/**
 * Rejects a release from the review queue attempted by software.
 *
 * `pending_review` exists for exactly one reason: the user is told "nothing
 * here is public until you approve it". That promise is about WHO releases the
 * post, so it has to be enforced against the credential, not against the route
 * — otherwise an agent holding a `posts:write` PAT simply approves its own
 * post, either by patching the status or by calling the approve endpoint, and
 * machine-written text about the user's real work goes public unread.
 *
 * A refusal here is `ForbiddenError`, not `BadRequestError`: the move itself is
 * legal (`assertPostStatusTransition` allows it) and the caller does own the
 * post — it is the *caller kind* that is not allowed to make it.
 *
 * Deliberately narrow:
 *
 * - `draft -> published` from a PAT stays legal. A draft was never presented to
 *   the user as awaiting a decision, and creating straight to `published` is
 *   already the default for an agent, so blocking it would take away nothing an
 *   agent cannot do in one request anyway.
 * - Re-sending `pending_review` stays the no-op it is for every other caller.
 *
 * Defaults to the human session for the same reason as
 * `assertMachineAuthoredPostIsImmutable`: only the paths that actually carry a
 * credential forward pass an `authType`.
 */
export function assertReviewReleaseIsHumanConsent(
  from: PostStatus,
  to: PostStatus,
  authType: "jwt" | "pat" = "jwt",
): void {
  if (authType === "pat" && from === "pending_review" && to === "published") {
    throw new ForbiddenError(
      "This post is waiting for review, and only its owner — signed in to " +
        "LinkHub — can publish it. An API token may not approve a post it " +
        "wrote: that review step is the human's consent to text written by " +
        "software. Leave the post as it is and ask the user to approve it, or " +
        "delete it and write a new one.",
    );
  }
}

/**
 * Rejects any content change to a post the user did not write themselves.
 *
 * The whole value of an `mcp`/`agent`/`commit` post is that a recruiter can
 * trust it was not polished by the candidate afterwards. That guarantee has to
 * live here, in the use case, so it holds identically for the web session, a
 * PAT and the MCP `update_post` tool — a UI that merely hides the edit button
 * guarantees nothing.
 *
 * `ForbiddenError` matches how the neighbouring post use-cases signal "you may
 * not do this to this post" (ownership checks).
 */
export function assertMachineAuthoredPostIsImmutable(
  source: PostSource,
  patch: Partial<Record<MachineAuthoredImmutableField, unknown>>,
  /**
   * Defaults to the human session: the only caller that forwards a real
   * `authType` is the update path, and everything else invoking this helper
   * (the digest tests, future internal callers) is asking the owner-side
   * question.
   */
  authType: "jwt" | "pat" = "jwt",
): void {
  if (source === "manual") {
    return;
  }

  const immutableFields: readonly MachineAuthoredImmutableField[] =
    authType === "pat"
      ? [...MACHINE_AUTHORED_IMMUTABLE_FIELDS, ...PAT_IMMUTABLE_FIELDS]
      : MACHINE_AUTHORED_IMMUTABLE_FIELDS;

  const attempted = immutableFields.filter(
    (field) => patch[field] !== undefined,
  );

  if (attempted.length === 0) {
    return;
  }

  throw new ForbiddenError(
    `This post was written by software (source: '${source}') and its content is ` +
      "immutable by design — that is what lets a reader trust it was not edited " +
      `afterwards. Rejected field(s): ${attempted.join(", ")}. ` +
      "The only permitted changes are 'status' (approve it, or delete the post " +
      "and have the software write a new one) and, for the owner in a real " +
      "session, attaching an 'externalUrl'.",
  );
}
