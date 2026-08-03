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

export interface IUpdatePostInput {
  userId: string;
  postId: string;
  /** How the caller authenticated — only PATs are subject to the disclosure policy. */
  authType?: "jwt" | "pat";
  source?: PostSource;
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
        });
      }
    }

    // Transitioning draft -> published stamps publishedAt if not already set.
    const publishedAt =
      input.status === "published" && post.publishedAt === null
        ? new Date()
        : undefined;

    post.updateContent({
      source: input.source,
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
