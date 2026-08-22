import {
  PostSource,
  PostStatus,
} from "../../../entity/post/post-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import {
  assertPostRespectsDisclosure,
  loadDisclosureContext,
} from "../../agent-policy/enforce-post-disclosure.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import {
  assertMachineAuthoredPostIsImmutable,
  assertPostStatusTransition,
} from "../shared/post-status-rules.js";
import { reembedResumeAfterPost } from "../shared/reembed-resume-after-post.js";

/**
 * Resolves the value a field will hold AFTER the patch.
 *
 * `??` is wrong here: an explicit `null` is a real instruction ("clear the
 * title") and must not fall through to the stored value.
 */
function afterPatch<T>(patched: T | undefined, current: T): T {
  return patched === undefined ? current : patched;
}

/**
 * NOTE the absence of `source`, and do not add it back.
 *
 * `source` is provenance — a claim about WHO WROTE the text — not content, and
 * there is no legitimate reason to change who wrote something after the fact.
 * It is set once, at creation, where `CreatePostUseCase` forces `manual` unless
 * the caller authenticated with a PAT.
 *
 * Accepting it here was a forgery hole in both directions, and neither was
 * caught by `assertMachineAuthoredPostIsImmutable`:
 *
 * - Upward: that assertion is a NO-OP for a `manual` post, so a web/JWT user
 *   could hand-write a post and then PATCH `source: "commit"` onto it, minting
 *   the machine-authored badge the review feature exists to make trustworthy.
 * - Downward: relabelling a machine post to `manual` would unlock the very
 *   content edits that assertion prevents.
 *
 * The field is DROPPED rather than validated. A validated field is one an
 * accidental `if` can re-open; a field that does not exist in the input type,
 * in the request schema, or in `PostEntity.updateContent` cannot be set by any
 * caller on any path — web session, PAT, or the MCP `update_post` tool.
 */
export interface IUpdatePostInput {
  userId: string;
  postId: string;
  /** How the caller authenticated — only PATs are subject to the disclosure policy. */
  authType?: "jwt" | "pat";
  title?: string | null;
  body?: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  workExperienceId?: string | null;
}

export class UpdatePostUseCase {
  constructor(
    private postsRepository: IPostRepository,
    private usersRepository?: IUsersRepository,
    private workExperienceRepository?: IWorkExperienceRepository,
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(input: IUpdatePostInput) {
    const post = await this.postsRepository.findById(input.postId);

    if (!post) {
      throw new ResourceNotFoundError("Post", input.postId);
    }

    if (post.userId !== input.userId) {
      throw new ForbiddenError("You do not have access to this post");
    }

    // Provenance first: a post the user did not write themselves accepts a
    // status change — plus, for the OWNER in a real session, an externalUrl —
    // and nothing else. Checked before the disclosure policy because a
    // rejected patch should not even load context. The authType matters here:
    // a PAT may not attach a link either, or an agent could retarget what a
    // frozen post's text appears to vouch for.
    assertMachineAuthoredPostIsImmutable(post.source, input, input.authType);

    if (input.status !== undefined) {
      assertPostStatusTransition(post.status, input.status);
    }

    // A partial update still has to be checked against the FULL resulting post:
    // an agent could otherwise slip a blocked term past the check by editing
    // only the title of a post whose body it already owns.
    if (input.authType === "pat") {
      const context = await loadDisclosureContext({
        userId: input.userId,
        usersRepository: this.usersRepository,
        workExperienceRepository: this.workExperienceRepository,
      });

      if (context) {
        assertPostRespectsDisclosure({
          user: context.user,
          workExperiences: context.workExperiences,
          workExperienceId: afterPatch(
            input.workExperienceId,
            post.workExperienceId,
          ),
          title: afterPatch(input.title, post.title),
          body: afterPatch(input.body, post.body),
          tags: afterPatch(input.tags, post.tags),
          externalUrl: afterPatch(input.externalUrl, post.externalUrl),
          coverImageUrl: afterPatch(input.coverImageUrl, post.coverImageUrl),
          images: afterPatch(input.images, post.images),
        });
      }
    }

    // Transitioning draft -> published stamps publishedAt if not already set.
    const publishedAt =
      input.status === "published" && post.publishedAt === null
        ? new Date()
        : undefined;

    post.updateContent({
      // No `source`: provenance is write-once, see `IUpdatePostInput`.
      title: input.title,
      body: input.body,
      coverImageUrl: input.coverImageUrl,
      images: input.images,
      tags: input.tags,
      status: input.status,
      externalUrl: input.externalUrl,
      metadata: input.metadata,
      workExperienceId: input.workExperienceId,
      publishedAt,
    });

    const updated = await this.postsRepository.update(post);

    if (updated.status === "published") {
      await reembedResumeAfterPost(
        input.userId,
        this.resumesRepository,
        this.enqueueResumeEmbeddingUseCase,
      );
    }

    return updated;
  }
}
