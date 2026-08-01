import {
  PostSource,
  PostStatus,
} from "../../../entity/post/post-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";

export interface IUpdatePostInput {
  userId: string;
  postId: string;
  source?: PostSource;
  title?: string | null;
  body?: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class UpdatePostUseCase {
  constructor(private postsRepository: IPostRepository) {}

  async execute(input: IUpdatePostInput) {
    const post = await this.postsRepository.findById(input.postId);

    if (!post) {
      throw new ResourceNotFoundError("Post", input.postId);
    }

    if (post.userId !== input.userId) {
      throw new ForbiddenError("You do not have access to this post");
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
      publishedAt,
    });

    return this.postsRepository.update(post);
  }
}
