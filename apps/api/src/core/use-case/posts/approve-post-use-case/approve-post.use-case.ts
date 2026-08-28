import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import {
  assertPostStatusTransition,
  assertReviewReleaseIsHumanConsent,
} from "../shared/post-status-rules.js";
import { reembedResumeAfterPost } from "../shared/reembed-resume-after-post.js";

export interface IApprovePostInput {
  userId: string;
  postId: string;
  /**
   * Which credential the caller used. Approving is the human half of the loop,
   * so it has to be refused for a PAT — the token belongs to the same user,
   * but the software holding it is not the user.
   */
  authType?: "jwt" | "pat";
}

/**
 * The human half of the machine-authoring loop: software writes a post as
 * `pending_review`, and this is the only way that post becomes public.
 *
 * It deliberately touches nothing but `status`/`publishedAt` — approving is an
 * act of consent to text that already exists, not an opportunity to revise it.
 */
export class ApprovePostUseCase {
  constructor(
    private postsRepository: IPostRepository,
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(input: IApprovePostInput) {
    const post = await this.postsRepository.findById(input.postId);

    if (!post) {
      throw new ResourceNotFoundError("Post", input.postId);
    }

    if (post.userId !== input.userId) {
      throw new ForbiddenError("You do not have access to this post");
    }

    // Approving something already public is a no-op, not an error: an agent (or
    // a double-clicked button) retrying after a lost response must not get a
    // failure for work that is already done. Returning early also protects the
    // original `publishedAt` and avoids a pointless re-embed.
    if (post.status === "published") {
      return post;
    }

    assertPostStatusTransition(post.status, "published");
    assertReviewReleaseIsHumanConsent(post.status, "published", input.authType);

    post.updateContent({
      status: "published",
      publishedAt: post.publishedAt ?? new Date(),
    });

    const updated = await this.postsRepository.update(post);

    // The post is public from now on, so recruiter search has to see it.
    await reembedResumeAfterPost(
      input.userId,
      this.resumesRepository,
      this.enqueueResumeEmbeddingUseCase,
    );

    return updated;
  }
}
