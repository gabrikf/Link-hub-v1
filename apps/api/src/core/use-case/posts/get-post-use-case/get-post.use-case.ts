import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";

export class GetPostUseCase {
  constructor(private postsRepository: IPostRepository) {}

  async execute(userId: string, postId: string) {
    const post = await this.postsRepository.findById(postId);

    if (!post) {
      throw new ResourceNotFoundError("Post", postId);
    }

    if (post.userId !== userId) {
      throw new ForbiddenError("You do not have access to this post");
    }

    return post;
  }
}
