import { ResourceNotFoundError } from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface IListPublicPostsInput {
  username: string;
  limit: number;
  offset: number;
}

export class ListPublicPostsUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private postsRepository: IPostRepository,
  ) {}

  async execute(input: IListPublicPostsInput) {
    const user = await this.usersRepository.findByLogin(input.username);

    if (!user) {
      throw new ResourceNotFoundError("User", input.username);
    }

    return this.postsRepository.listPublishedByUserId(user.id, {
      limit: input.limit,
      offset: input.offset,
    });
  }
}
