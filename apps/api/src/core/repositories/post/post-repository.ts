import { PostEntity } from "../../entity/post/post-entity.js";

export interface PostListOptions {
  limit: number;
  offset: number;
}

export interface IPostRepository {
  create(post: PostEntity): Promise<PostEntity>;
  findById(id: string): Promise<PostEntity | null>;
  listByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]>;
  listPublishedByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]>;
  update(post: PostEntity): Promise<PostEntity>;
  delete(id: string): Promise<void>;
}
