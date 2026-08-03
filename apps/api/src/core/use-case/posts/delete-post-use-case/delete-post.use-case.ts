import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { reembedResumeAfterPost } from "../shared/reembed-resume-after-post.js";

export class DeletePostUseCase {
  constructor(
    private postsRepository: IPostRepository,
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(userId: string, postId: string) {
    const post = await this.postsRepository.findById(postId);

    if (!post) {
      throw new ResourceNotFoundError("Post", postId);
    }

    if (post.userId !== userId) {
      throw new ForbiddenError("You do not have access to this post");
    }

    const wasPublished = post.status === "published";

    await this.postsRepository.delete(postId);

    // Deleting a published post has to refresh the vector too — otherwise
    // recruiter search keeps matching on text the user just took down.
    if (wasPublished) {
      await reembedResumeAfterPost(
        userId,
        this.resumesRepository,
        this.enqueueResumeEmbeddingUseCase,
      );
    }

    return { success: true };
  }
}
