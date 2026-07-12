import { IPostRepository } from "../../../repositories/post/post-repository.js";

export interface IListMyPostsInput {
  userId: string;
  limit: number;
  offset: number;
}

export class ListMyPostsUseCase {
  constructor(private postsRepository: IPostRepository) {}

  async execute(input: IListMyPostsInput) {
    return this.postsRepository.listByUserId(input.userId, {
      limit: input.limit,
      offset: input.offset,
    });
  }
}
