import {
  PostEntity,
  type PostSource,
  type PostStatus,
} from "../../../entity/post/post-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
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

export interface ICreatePostInput {
  userId: string;
  /**
   * How the caller authenticated. Web/JWT sessions may not spoof the post
   * `source` — only PAT callers (MCP, agents, commit hooks) may set a
   * non-manual source. Defaults to treating unknown auth as untrusted (manual).
   */
  authType?: "jwt" | "pat";
  source?: PostSource;
  title?: string | null;
  body: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Attributes the post to a role, so it inherits that role's disclosure level. */
  workExperienceId?: string | null;
}

export class CreatePostUseCase {
  constructor(
    private postsRepository: IPostRepository,
    private usersRepository: IUsersRepository,
    private workExperienceRepository?: IWorkExperienceRepository,
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(input: ICreatePostInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    // Only PAT callers may claim a non-manual source. A web/JWT session (or an
    // unknown auth type) is always forced to "manual" so it can't spoof
    // mcp/agent/commit provenance.
    const source =
      input.authType === "pat" ? input.source ?? "manual" : "manual";
    const status = input.status ?? "published";

    // The disclosure policy constrains software writing on the user's behalf,
    // not the user writing about their own career — so only PATs are checked.
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
          workExperienceId: input.workExperienceId,
          title: input.title,
          body: input.body,
          tags: input.tags,
          externalUrl: input.externalUrl,
          coverImageUrl: input.coverImageUrl,
          images: input.images,
        });
      }
    }

    const post = PostEntity.create({
      userId: input.userId,
      source,
      title: input.title ?? null,
      body: input.body,
      coverImageUrl: input.coverImageUrl ?? null,
      images: input.images ?? null,
      tags: input.tags ?? null,
      status,
      externalUrl: input.externalUrl ?? null,
      metadata: input.metadata ?? null,
      workExperienceId: input.workExperienceId ?? null,
      publishedAt: status === "published" ? new Date() : null,
    });

    const created = await this.postsRepository.create(post);

    // Only a published post is visible to recruiter search, so a draft (or a
    // post still waiting for review) has nothing to re-embed yet.
    if (created.status === "published") {
      await reembedResumeAfterPost(
        input.userId,
        this.resumesRepository,
        this.enqueueResumeEmbeddingUseCase,
      );
    }

    return created;
  }
}
